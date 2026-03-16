"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";

export async function updateFirmProfile(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const name = formData.get("name") as string;
  if (!name) return { error: "Firm name is required" };

  const db = createServerClient();
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

  const db = createServerClient();
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

  const db = createServerClient();
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

  // Only owners and admins can invite
  if (ctx.role !== "firm_owner" && ctx.role !== "firm_admin") {
    return { error: "Only owners and admins can invite staff" };
  }

  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const role = (formData.get("role") as string) || "counselor";
  const firstName = (formData.get("first_name") as string)?.trim() || "";
  const lastName = (formData.get("last_name") as string)?.trim() || "";

  if (!email) return { error: "Email is required" };

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

    revalidatePath("/settings");
    return { success: true };
  }

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

  revalidatePath("/settings");
  return { success: true };
}

export async function removeMember(membershipId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = createServerClient();
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
