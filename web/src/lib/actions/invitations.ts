"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createServerClient } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import {
  createClerkStudentInvitation,
  revokeClerkInvitation,
} from "../clerk/backend";
import { sendStudentPortalInviteEmail } from "../email";
import { hasPermission } from "@/modules/permissions/service";

type ActionResult<T = unknown> =
  | ({ success: true } & T)
  | { error: string };

const REDIRECT_URL_PATH = "/dashboard";

function appOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000"
  );
}

export async function sendStudentInvite(args: {
  studentId: string;
  email: string;
  note?: string;
}): Promise<ActionResult<{ invitationId: string }>> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  if (
    !hasPermission(
      { userId: ctx.userId, firmId: ctx.firmId, role: ctx.role, assignedStudentIds: [] },
      "manage_staff"
    )
  ) {
    return { error: "You don't have permission to invite students" };
  }

  const email = args.email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Please provide a valid email address" };
  }

  const db = createServerClient();

  // Load student + firm
  const { data: student } = await db
    .from("students")
    .select("id, firm_id, first_name, last_name, user_id")
    .eq("id", args.studentId)
    .eq("firm_id", ctx.firmId)
    .single();

  if (!student) return { error: "Student not found" };

  // Block if there's already a pending invite or an accepted (linked) account
  const { data: existingInvite } = await db
    .from("student_invitations")
    .select("id, status")
    .eq("student_id", student.id)
    .eq("status", "pending")
    .maybeSingle();
  if (existingInvite) {
    return {
      error: "An invitation is already pending for this student. Resend or revoke it first.",
    };
  }

  if (student.user_id) {
    // Check whether the linked user is a real (non-placeholder) account
    const { data: linkedUser } = await db
      .from("users")
      .select("auth_provider_user_id")
      .eq("id", student.user_id)
      .single();
    if (linkedUser && !linkedUser.auth_provider_user_id.startsWith("invited_")) {
      return { error: "This student already has a portal account" };
    }
  }

  // Refuse if another user already owns this email
  const { data: emailOwner } = await db
    .from("users")
    .select("id, auth_provider_user_id")
    .eq("email", email)
    .maybeSingle();
  if (
    emailOwner &&
    !emailOwner.auth_provider_user_id.startsWith("invited_") &&
    emailOwner.id !== student.user_id
  ) {
    return {
      error: "Another account is already using that email address",
    };
  }

  const [firmRow, inviter] = await Promise.all([
    db.from("firms").select("name").eq("id", ctx.firmId).single(),
    db
      .from("users")
      .select("first_name, last_name")
      .eq("id", ctx.dbUserId)
      .single(),
  ]);
  const firmName = firmRow.data?.name ?? "your firm";
  const counselorName =
    [inviter.data?.first_name, inviter.data?.last_name]
      .filter(Boolean)
      .join(" ") || "Your counselor";

  // Pre-create / reuse placeholder user
  let placeholderUserId: string;
  if (emailOwner && emailOwner.auth_provider_user_id.startsWith("invited_")) {
    placeholderUserId = emailOwner.id;
  } else if (student.user_id) {
    placeholderUserId = student.user_id;
    // refresh its email to match the invite email
    await db.from("users").update({ email }).eq("id", placeholderUserId);
  } else {
    const placeholderToken = randomUUID();
    const { data: created, error: createErr } = await db
      .from("users")
      .insert({
        auth_provider_user_id: `invited_${placeholderToken}`,
        email,
        first_name: student.first_name,
        last_name: student.last_name,
      })
      .select("id")
      .single();
    if (createErr || !created) {
      console.error("Failed to create placeholder user:", createErr);
      return { error: "Failed to create invitation" };
    }
    placeholderUserId = created.id;
  }

  // Link student → placeholder
  if (student.user_id !== placeholderUserId) {
    await db
      .from("students")
      .update({
        user_id: placeholderUserId,
        updated_by_user_id: ctx.dbUserId,
      })
      .eq("id", student.id)
      .eq("firm_id", ctx.firmId);
  }

  // Pre-stage firm membership (role='student', active)
  const { data: existingMembership } = await db
    .from("firm_memberships")
    .select("id, role, status")
    .eq("firm_id", ctx.firmId)
    .eq("user_id", placeholderUserId)
    .maybeSingle();

  if (!existingMembership) {
    const { error: memErr } = await db.from("firm_memberships").insert({
      firm_id: ctx.firmId,
      user_id: placeholderUserId,
      role: "student",
      status: "active",
      invited_by_user_id: ctx.dbUserId,
    });
    if (memErr) {
      console.error("Failed to create student membership:", memErr);
      return { error: "Failed to create invitation" };
    }
  } else if (
    existingMembership.role !== "student" ||
    existingMembership.status !== "active"
  ) {
    await db
      .from("firm_memberships")
      .update({
        role: "student",
        status: "active",
        invited_by_user_id: ctx.dbUserId,
      })
      .eq("id", existingMembership.id);
  }

  // Create Clerk invitation (notify: false — we send our own email)
  let clerkInvite;
  try {
    clerkInvite = await createClerkStudentInvitation({
      emailAddress: email,
      publicMetadata: {
        kind: "student_invite",
        placeholder_user_id: placeholderUserId,
        student_id: student.id,
        firm_id: ctx.firmId,
      },
      redirectUrl: `${appOrigin()}${REDIRECT_URL_PATH}`,
    });
  } catch (e) {
    console.error("Clerk createInvitation failed:", e);
    return { error: "Failed to create invitation with auth provider" };
  }

  // Record locally
  const { data: inviteRow, error: inviteErr } = await db
    .from("student_invitations")
    .insert({
      firm_id: ctx.firmId,
      student_id: student.id,
      placeholder_user_id: placeholderUserId,
      email,
      clerk_invitation_id: clerkInvite.id,
      sent_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();

  if (inviteErr || !inviteRow) {
    console.error("Failed to record invitation:", inviteErr);
    // best-effort cleanup of the Clerk invitation
    revokeClerkInvitation(clerkInvite.id).catch(() => undefined);
    return { error: "Failed to record invitation" };
  }

  // Send the email
  try {
    await sendStudentPortalInviteEmail({
      email,
      studentFirstName: student.first_name,
      firmName,
      counselorName,
      inviteUrl: clerkInvite.url,
      note: args.note,
    });
  } catch (e) {
    console.error("Failed to send invitation email:", e);
    return {
      error:
        "Invitation created, but the email failed to send. Try resending.",
    };
  }

  revalidatePath(`/students/${student.id}`);
  return { success: true, invitationId: inviteRow.id };
}

export async function resendStudentInvite(args: {
  invitationId: string;
  note?: string;
}): Promise<ActionResult<{ invitationId: string }>> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  if (
    !hasPermission(
      { userId: ctx.userId, firmId: ctx.firmId, role: ctx.role, assignedStudentIds: [] },
      "manage_staff"
    )
  ) {
    return { error: "You don't have permission to invite students" };
  }

  const db = createServerClient();
  const { data: invite } = await db
    .from("student_invitations")
    .select("id, student_id, email, clerk_invitation_id, status")
    .eq("id", args.invitationId)
    .eq("firm_id", ctx.firmId)
    .single();

  if (!invite) return { error: "Invitation not found" };
  if (invite.status === "accepted") {
    return { error: "This invitation has already been accepted" };
  }

  // Revoke the old Clerk invitation (best effort)
  if (invite.status === "pending") {
    await revokeClerkInvitation(invite.clerk_invitation_id).catch((e) => {
      console.warn("Could not revoke old Clerk invitation:", e);
    });
    await db
      .from("student_invitations")
      .update({ status: "revoked" })
      .eq("id", invite.id);
  }

  return sendStudentInvite({
    studentId: invite.student_id,
    email: invite.email,
    note: args.note,
  });
}

export async function revokeStudentInvite(args: {
  invitationId: string;
}): Promise<ActionResult> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  if (
    !hasPermission(
      { userId: ctx.userId, firmId: ctx.firmId, role: ctx.role, assignedStudentIds: [] },
      "manage_staff"
    )
  ) {
    return { error: "You don't have permission to revoke invitations" };
  }

  const db = createServerClient();
  const { data: invite } = await db
    .from("student_invitations")
    .select("id, student_id, clerk_invitation_id, status")
    .eq("id", args.invitationId)
    .eq("firm_id", ctx.firmId)
    .single();

  if (!invite) return { error: "Invitation not found" };
  if (invite.status !== "pending") {
    return { error: "Only pending invitations can be revoked" };
  }

  await revokeClerkInvitation(invite.clerk_invitation_id).catch((e) => {
    console.warn("Could not revoke Clerk invitation:", e);
  });

  await db
    .from("student_invitations")
    .update({ status: "revoked" })
    .eq("id", invite.id);

  revalidatePath(`/students/${invite.student_id}`);
  return { success: true };
}
