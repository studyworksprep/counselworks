"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
// Service role (allowlisted): invitation provisioning creates placeholder
// users and pre-staged memberships for people who cannot yet satisfy RLS.
import { createServerClient } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import { recordAuditEvent } from "../audit";
import {
  createClerkPortalInvitation,
  revokeClerkInvitation,
} from "../clerk/backend";
import {
  sendStudentPortalInviteEmail,
  sendFamilyPortalInviteEmail,
} from "../email";
import { hasPermission } from "@/modules/permissions/service";
import {
  AuthorizationError,
  requireFamilyAccess,
  requireStudentAccess,
} from "../auth/authorize";
import { STAFF_ROLE_LIST } from "../auth/resolve";

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
      "manage_clients"
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

  // Scoped counselors may only invite their assigned students.
  try {
    await requireStudentAccess(db, ctx, student.id);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "Student not found" };
    throw e;
  }

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
    clerkInvite = await createClerkPortalInvitation({
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

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "student_invitation",
    entityId: inviteRow.id,
    actionType: "portal_invite_sent",
    label: `Portal invite sent to ${student.first_name} ${student.last_name}`,
  });

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
      "manage_clients"
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
  try {
    await requireStudentAccess(db, ctx, invite.student_id);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return { error: "Invitation not found" };
    }
    throw e;
  }
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
      "manage_clients"
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
  try {
    await requireStudentAccess(db, ctx, invite.student_id);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return { error: "Invitation not found" };
    }
    throw e;
  }
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

// ---------------------------------------------------------------------------
// Parent / guardian (family portal) invitations — fix plan Phase 2
// ---------------------------------------------------------------------------

export async function sendParentInvite(args: {
  familyMemberId: string;
  email: string;
  note?: string;
}): Promise<ActionResult<{ invitationId: string }>> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  if (
    !hasPermission(
      { userId: ctx.userId, firmId: ctx.firmId, role: ctx.role, assignedStudentIds: [] },
      "manage_clients"
    )
  ) {
    return { error: "You don't have permission to invite family members" };
  }

  const email = args.email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Please provide a valid email address" };
  }

  const db = createServerClient();

  const { data: member } = await db
    .from("family_members")
    .select(
      `id, family_id, user_id, relationship_type,
       users:user_id(id, first_name, last_name, email, auth_provider_user_id),
       families:family_id(id, household_name)`
    )
    .eq("id", args.familyMemberId)
    .eq("firm_id", ctx.firmId)
    .single();

  if (!member || !member.user_id) return { error: "Family member not found" };

  // Scoped counselors may only invite contacts of their assigned families.
  try {
    await requireFamilyAccess(db, ctx, member.family_id);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return { error: "Family member not found" };
    }
    throw e;
  }

  const memberUser = member.users as unknown as {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    auth_provider_user_id: string;
  } | null;
  if (!memberUser) return { error: "Family member not found" };

  if (!memberUser.auth_provider_user_id.startsWith("invited_")) {
    return { error: "This family member already has an account" };
  }

  const { data: existingInvite } = await db
    .from("family_invitations")
    .select("id")
    .eq("family_member_id", member.id)
    .eq("status", "pending")
    .maybeSingle();
  if (existingInvite) {
    return {
      error:
        "An invitation is already pending for this family member. Resend or revoke it first.",
    };
  }

  // The member's placeholder user is the invite target. If a different
  // account already owns the requested email, refuse rather than link two
  // identities.
  const { data: emailOwner } = await db
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (emailOwner && emailOwner.id !== memberUser.id) {
    return { error: "Another account is already using that email address" };
  }
  if (memberUser.email !== email) {
    await db.from("users").update({ email }).eq("id", memberUser.id);
  }

  // Pre-stage firm membership (role='parent_guardian', active).
  const { data: existingMembership } = await db
    .from("firm_memberships")
    .select("id, role, status")
    .eq("firm_id", ctx.firmId)
    .eq("user_id", memberUser.id)
    .maybeSingle();

  if (!existingMembership) {
    const { error: memErr } = await db.from("firm_memberships").insert({
      firm_id: ctx.firmId,
      user_id: memberUser.id,
      role: "parent_guardian",
      status: "active",
      invited_by_user_id: ctx.dbUserId,
    });
    if (memErr) {
      console.error("Failed to create parent membership:", memErr);
      return { error: "Failed to create invitation" };
    }
  } else if ((STAFF_ROLE_LIST as readonly string[]).includes(existingMembership.role)) {
    return { error: "This person is a staff member of your firm" };
  } else if (
    existingMembership.role !== "parent_guardian" ||
    existingMembership.status !== "active"
  ) {
    await db
      .from("firm_memberships")
      .update({
        role: "parent_guardian",
        status: "active",
        invited_by_user_id: ctx.dbUserId,
      })
      .eq("id", existingMembership.id);
  }

  const [firmRow, inviter, familyStudents] = await Promise.all([
    db.from("firms").select("name").eq("id", ctx.firmId).single(),
    db
      .from("users")
      .select("first_name, last_name")
      .eq("id", ctx.dbUserId)
      .single(),
    db
      .from("students")
      .select("first_name")
      .eq("firm_id", ctx.firmId)
      .eq("family_id", member.family_id),
  ]);
  const firmName = firmRow.data?.name ?? "your firm";
  const counselorName =
    [inviter.data?.first_name, inviter.data?.last_name]
      .filter(Boolean)
      .join(" ") || "Your counselor";
  const studentNames = (familyStudents.data ?? [])
    .map((s) => s.first_name)
    .filter(Boolean)
    .join(" and ");

  let clerkInvite;
  try {
    clerkInvite = await createClerkPortalInvitation({
      emailAddress: email,
      publicMetadata: {
        kind: "parent_invite",
        placeholder_user_id: memberUser.id,
        family_id: member.family_id,
        family_member_id: member.id,
        firm_id: ctx.firmId,
      },
      redirectUrl: `${appOrigin()}${REDIRECT_URL_PATH}`,
    });
  } catch (e) {
    console.error("Clerk createInvitation failed:", e);
    return { error: "Failed to create invitation with auth provider" };
  }

  const { data: inviteRow, error: inviteErr } = await db
    .from("family_invitations")
    .insert({
      firm_id: ctx.firmId,
      family_id: member.family_id,
      family_member_id: member.id,
      placeholder_user_id: memberUser.id,
      email,
      clerk_invitation_id: clerkInvite.id,
      sent_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();

  if (inviteErr || !inviteRow) {
    console.error("Failed to record family invitation:", inviteErr);
    revokeClerkInvitation(clerkInvite.id).catch(() => undefined);
    return { error: "Failed to record invitation" };
  }

  try {
    await sendFamilyPortalInviteEmail({
      email,
      parentFirstName: memberUser.first_name,
      studentNames,
      firmName,
      counselorName,
      inviteUrl: clerkInvite.url,
      note: args.note,
    });
  } catch (e) {
    console.error("Failed to send family invitation email:", e);
    return {
      error:
        "Invitation created, but the email failed to send. Try resending.",
    };
  }

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "family_invitation",
    entityId: inviteRow.id,
    actionType: "portal_invite_sent",
    label: `Family portal invite sent to ${memberUser.first_name} ${memberUser.last_name}`,
  });

  revalidatePath(`/families/${member.family_id}`);
  return { success: true, invitationId: inviteRow.id };
}

export async function resendParentInvite(args: {
  invitationId: string;
  note?: string;
}): Promise<ActionResult<{ invitationId: string }>> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  if (
    !hasPermission(
      { userId: ctx.userId, firmId: ctx.firmId, role: ctx.role, assignedStudentIds: [] },
      "manage_clients"
    )
  ) {
    return { error: "You don't have permission to invite family members" };
  }

  const db = createServerClient();
  const { data: invite } = await db
    .from("family_invitations")
    .select("id, family_id, family_member_id, email, clerk_invitation_id, status")
    .eq("id", args.invitationId)
    .eq("firm_id", ctx.firmId)
    .single();

  if (!invite) return { error: "Invitation not found" };
  try {
    await requireFamilyAccess(db, ctx, invite.family_id);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return { error: "Invitation not found" };
    }
    throw e;
  }
  if (invite.status === "accepted") {
    return { error: "This invitation has already been accepted" };
  }

  if (invite.status === "pending") {
    await revokeClerkInvitation(invite.clerk_invitation_id).catch((e) => {
      console.warn("Could not revoke old Clerk invitation:", e);
    });
    await db
      .from("family_invitations")
      .update({ status: "revoked" })
      .eq("id", invite.id);
  }

  return sendParentInvite({
    familyMemberId: invite.family_member_id,
    email: invite.email,
    note: args.note,
  });
}

export async function revokeParentInvite(args: {
  invitationId: string;
}): Promise<ActionResult> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  if (
    !hasPermission(
      { userId: ctx.userId, firmId: ctx.firmId, role: ctx.role, assignedStudentIds: [] },
      "manage_clients"
    )
  ) {
    return { error: "You don't have permission to revoke invitations" };
  }

  const db = createServerClient();
  const { data: invite } = await db
    .from("family_invitations")
    .select("id, family_id, clerk_invitation_id, status")
    .eq("id", args.invitationId)
    .eq("firm_id", ctx.firmId)
    .single();

  if (!invite) return { error: "Invitation not found" };
  try {
    await requireFamilyAccess(db, ctx, invite.family_id);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return { error: "Invitation not found" };
    }
    throw e;
  }
  if (invite.status !== "pending") {
    return { error: "Only pending invitations can be revoked" };
  }

  await revokeClerkInvitation(invite.clerk_invitation_id).catch((e) => {
    console.warn("Could not revoke Clerk invitation:", e);
  });

  await db
    .from("family_invitations")
    .update({ status: "revoked" })
    .eq("id", invite.id);

  revalidatePath(`/families/${invite.family_id}`);
  return { success: true };
}
