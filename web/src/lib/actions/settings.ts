"use server";

import { revalidatePath } from "next/cache";
import { getDb, createServerClient } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import { hasPermission } from "@/modules/permissions/service";
import { sendInvitationEmail } from "@/lib/email";
import {
  ROUND_VALUES,
  parseRoundAnchorOverrides,
} from "../constants/applications";

function permCtx(ctx: { dbUserId: string; firmId: string; role: string }) {
  return { userId: ctx.dbUserId, firmId: ctx.firmId, role: ctx.role, assignedStudentIds: [] };
}

export async function updateFirmProfile(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (!hasPermission(permCtx(ctx), "manage_firm")) {
    return { error: "Only owners and admins can update firm settings" };
  }

  const name = formData.get("name") as string;
  if (!name) return { error: "Firm name is required" };

  const db = getDb();
  const { error } = await db
    .from("firms")
    .update({
      name,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ctx.firmId);

  if (error) {
    console.error("Failed to update firm:", error);
    return { error: "Failed to update firm profile" };
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function updateBranding(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (!hasPermission(permCtx(ctx), "manage_firm")) {
    return { error: "Only owners and admins can update branding" };
  }

  const db = getDb();
  const { error } = await db
    .from("firm_settings")
    .update({
      branding_logo_url: (formData.get("logo_url") as string) || null,
      primary_color: (formData.get("primary_color") as string) || null,
      updated_at: new Date().toISOString(),
    })
    .eq("firm_id", ctx.firmId);

  if (error) {
    console.error("Failed to update branding:", error);
    return { error: "Failed to update branding" };
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function updateMemberRole(membershipId: string, role: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (!hasPermission(permCtx(ctx), "manage_staff")) {
    return { error: "Only owners and admins can change roles" };
  }

  const db = getDb();
  const { error } = await db
    .from("firm_memberships")
    .update({
      role,
      updated_at: new Date().toISOString(),
    })
    .eq("id", membershipId)
    .eq("firm_id", ctx.firmId);

  if (error) return { error: "Failed to update role" };

  revalidatePath("/settings");
  return { success: true };
}

export async function inviteStaffMember(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  if (!hasPermission(permCtx(ctx), "manage_staff")) {
    return { error: "Only owners and admins can invite staff" };
  }

  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const role = (formData.get("role") as string) || "counselor";
  const firstName = (formData.get("first_name") as string)?.trim() || "";
  const lastName = (formData.get("last_name") as string)?.trim() || "";

  if (!email) return { error: "Email is required" };

  // Service role (allowlisted): invitation provisioning creates users and
  // memberships for people who cannot yet satisfy RLS (no session exists).
  const db = createServerClient();

  // Check if user already exists
  let { data: existingUser } = await db
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  // Create placeholder user if they don't exist yet
  if (!existingUser) {
    // auth_provider_user_id is NOT NULL — generate a placeholder until they sign up via Clerk
    const placeholderAuthId = `invited_${crypto.randomUUID()}`;
    const { data: newUser, error: userError } = await db
      .from("users")
      .insert({
        auth_provider_user_id: placeholderAuthId,
        email,
        first_name: firstName || "Invited",
        last_name: lastName || "User",
      })
      .select("id")
      .single();

    if (userError || !newUser) {
      console.error("Failed to create invited user:", userError);
      return { error: "Failed to create user account" };
    }
    existingUser = newUser;
  }

  // Check if already a member of this firm
  const { data: existingMembership } = await db
    .from("firm_memberships")
    .select("id, status")
    .eq("firm_id", ctx.firmId)
    .eq("user_id", existingUser.id)
    .single();

  if (existingMembership) {
    if (existingMembership.status === "active") {
      return { error: "This person is already a member of your firm" };
    }
    // Reactivate if previously removed/suspended
    const { error: reactivateError } = await db
      .from("firm_memberships")
      .update({
        status: "active",
        role,
        joined_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingMembership.id);

    if (reactivateError) return { error: "Failed to reactivate membership" };
  } else {
    // Create new membership
    const { error: memberError } = await db
      .from("firm_memberships")
      .insert({
        firm_id: ctx.firmId,
        user_id: existingUser.id,
        role,
        status: "active",
        invited_by_user_id: ctx.dbUserId,
        joined_at: new Date().toISOString(),
      });

    if (memberError) {
      console.error("Failed to create membership:", memberError);
      return { error: "Failed to invite staff member" };
    }
  }

  // Send invitation email (best-effort — don't fail the invite if email fails)
  try {
    const [{ data: firm }, { data: inviter }] = await Promise.all([
      db.from("firms").select("name").eq("id", ctx.firmId).single(),
      db
        .from("users")
        .select("first_name, last_name")
        .eq("id", ctx.dbUserId)
        .single(),
    ]);
    const firmName = firm?.name ?? "your firm";
    const inviterName = inviter
      ? `${inviter.first_name} ${inviter.last_name}`.trim()
      : "A colleague";
    const signUpUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.counselworks.io"}/sign-up`;
    await sendInvitationEmail(email, firmName, inviterName, signUpUrl);
  } catch (emailErr) {
    console.error("Failed to send invite email (non-fatal):", emailErr);
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function removeMember(membershipId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (!hasPermission(permCtx(ctx), "manage_staff")) {
    return { error: "Only owners and admins can remove members" };
  }

  const db = getDb();
  const { error } = await db
    .from("firm_memberships")
    .update({
      status: "inactive",
      updated_at: new Date().toISOString(),
    })
    .eq("id", membershipId)
    .eq("firm_id", ctx.firmId);

  if (error) return { error: "Failed to remove member" };

  revalidatePath("/settings");
  return { success: true };
}

/**
 * Firm-level round → deadline defaults (fix plan 8.7). Month/day per round;
 * applications created without an explicit deadline anchor to these for the
 * student's class year. Blank fields fall back to the built-in defaults.
 */
export async function updateRoundDeadlineDefaults(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (!hasPermission(permCtx(ctx), "manage_firm")) {
    return { error: "Only owners and admins can update deadline defaults" };
  }

  const raw: Record<string, { month: number; day: number }> = {};
  for (const round of ROUND_VALUES) {
    const month = Number(formData.get(`${round}_month`));
    const day = Number(formData.get(`${round}_day`));
    if (month && day) raw[round] = { month, day };
  }
  // Re-parse through the shared validator so only well-formed anchors land.
  const overrides = parseRoundAnchorOverrides(raw);
  const badRound = Object.keys(raw).find((r) => !overrides[r]);
  if (badRound) {
    return { error: `Invalid month/day for ${badRound.toUpperCase()}` };
  }

  const db = getDb();
  const { error } = await db
    .from("firm_settings")
    .update({
      round_deadline_defaults_json: overrides,
      updated_at: new Date().toISOString(),
    })
    .eq("firm_id", ctx.firmId);

  if (error) {
    console.error("Failed to update deadline defaults:", error);
    return { error: "Failed to update deadline defaults" };
  }

  revalidatePath("/settings");
  return { success: true };
}

/**
 * Default workflow auto-assignment (fix plan 10.8): the template that is
 * instantiated automatically for every newly created student. Empty
 * selection turns auto-assignment off.
 */
export async function updateDefaultWorkflow(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (!hasPermission(permCtx(ctx), "manage_firm")) {
    return { error: "Only owners and admins can update workflow defaults" };
  }

  const templateId = (formData.get("template_id") as string) || null;
  const db = getDb();

  if (templateId) {
    const { data: template } = await db
      .from("workflow_templates")
      .select("id")
      .eq("id", templateId)
      .or(`firm_id.eq.${ctx.firmId},is_system_template.eq.true`)
      .maybeSingle();
    if (!template) return { error: "Workflow template not found" };
  }

  const { error } = await db
    .from("firm_settings")
    .update({
      default_workflow_template_id: templateId,
      updated_at: new Date().toISOString(),
    })
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to update default workflow" };

  revalidatePath("/settings");
  return { success: true };
}
