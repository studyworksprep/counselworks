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
