"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";

export async function createFamily(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const householdName = formData.get("household_name") as string;
  const city = (formData.get("city") as string) || null;
  const stateRegion = (formData.get("state_region") as string) || null;
  const postalCode = (formData.get("postal_code") as string) || null;
  const addressLine1 = (formData.get("address_line1") as string) || null;

  if (!householdName) {
    return { error: "Household name is required" };
  }

  const db = createServerClient();
  const { data, error } = await db
    .from("families")
    .insert({
      firm_id: ctx.firmId,
      household_name: householdName,
      city,
      state_region: stateRegion,
      postal_code: postalCode,
      address_line1: addressLine1,
      created_by_user_id: ctx.dbUserId,
      updated_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create family:", error);
    return { error: "Failed to create family" };
  }

  revalidatePath("/families");
  revalidatePath("/dashboard");
  return { id: data.id };
}

export async function updateFamily(familyId: string, formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const updates: Record<string, unknown> = {
    updated_by_user_id: ctx.dbUserId,
  };

  const fields = [
    "household_name",
    "address_line1",
    "address_line2",
    "city",
    "state_region",
    "postal_code",
    "country",
  ];

  for (const field of fields) {
    const value = formData.get(field);
    if (value !== null) {
      updates[field] = value || null;
    }
  }

  const db = createServerClient();
  const { error } = await db
    .from("families")
    .update(updates)
    .eq("id", familyId)
    .eq("firm_id", ctx.firmId);

  if (error) return { error: "Failed to update family" };

  revalidatePath(`/families/${familyId}`);
  revalidatePath("/families");
  return { success: true };
}

export async function archiveFamily(familyId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = createServerClient();
  const { error } = await db
    .from("families")
    .update({
      archived_at: new Date().toISOString(),
      updated_by_user_id: ctx.dbUserId,
    })
    .eq("id", familyId)
    .eq("firm_id", ctx.firmId);

  if (error) return { error: "Failed to archive family" };

  revalidatePath("/families");
  return { success: true };
}
