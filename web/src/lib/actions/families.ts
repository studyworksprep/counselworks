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

export async function addFamilyMember(familyId: string, formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const firstName = (formData.get("first_name") as string)?.trim();
  const lastName = (formData.get("last_name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const relationshipType = formData.get("relationship_type") as string;
  const isPrimaryContact = formData.get("is_primary_contact") === "on";

  if (!firstName || !lastName || !email || !relationshipType) {
    return { error: "First name, last name, email, and relationship are required" };
  }

  const db = createServerClient();

  // Verify the family belongs to this firm
  const { data: family } = await db
    .from("families")
    .select("id")
    .eq("id", familyId)
    .eq("firm_id", ctx.firmId)
    .single();

  if (!family) return { error: "Family not found" };

  // Look up or create user by email
  let { data: user } = await db
    .from("users")
    .select("id")
    .eq("email", email)
    .single();

  if (!user) {
    // Create a placeholder user record — they can claim this via Clerk signup later
    const { data: newUser, error: userError } = await db
      .from("users")
      .insert({
        auth_provider_user_id: `pending_${crypto.randomUUID()}`,
        email,
        first_name: firstName,
        last_name: lastName,
      })
      .select("id")
      .single();

    if (userError) {
      console.error("Failed to create user for family member:", userError);
      return { error: "Failed to create family member" };
    }
    user = newUser;
  }

  // Insert family member
  const { error } = await db.from("family_members").insert({
    firm_id: ctx.firmId,
    family_id: familyId,
    user_id: user!.id,
    relationship_type: relationshipType,
    is_primary_contact: isPrimaryContact,
  });

  if (error) {
    console.error("Failed to add family member:", error);
    return { error: "Failed to add family member" };
  }

  revalidatePath(`/families/${familyId}`);
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
