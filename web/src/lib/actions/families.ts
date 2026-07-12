"use server";

import { revalidatePath } from "next/cache";
import { getDb, createServerClient } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import { requireClientIntake, requireStaff } from "../auth/authorize";
import { recordAuditEvent } from "../audit";

export async function createFamily(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireClientIntake(ctx);
  } catch {
    return { error: "Only owners and admins can add families" };
  }

  const householdName = formData.get("household_name") as string;
  const city = (formData.get("city") as string) || null;
  const stateRegion = (formData.get("state_region") as string) || null;
  const postalCode = (formData.get("postal_code") as string) || null;
  const addressLine1 = (formData.get("address_line1") as string) || null;

  if (!householdName) {
    return { error: "Household name is required" };
  }

  const db = getDb();
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
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

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

  const db = getDb();
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
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const firstName = (formData.get("first_name") as string)?.trim();
  const lastName = (formData.get("last_name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim();
  const relationshipType = formData.get("relationship_type") as string;
  const isPrimaryContact = formData.get("is_primary_contact") === "on";

  if (!firstName || !lastName || !email || !relationshipType) {
    return { error: "First name, last name, email, and relationship are required" };
  }

  // Service role (allowlisted): creates the placeholder users row for a
  // contact with no account yet. The family-portal invitation flow
  // (sendParentInvite) later reuses this exact placeholder, so the prefix
  // must stay "invited_" to match the claim paths.
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
        auth_provider_user_id: `invited_${crypto.randomUUID()}`,
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

  // A family has at most one primary contact: demote the current one before
  // marking the new member (fix plan 7.8; mirrors assignments.ts).
  if (isPrimaryContact) {
    await db
      .from("family_members")
      .update({ is_primary_contact: false })
      .eq("firm_id", ctx.firmId)
      .eq("family_id", familyId)
      .eq("is_primary_contact", true);
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

/**
 * Move the primary-contact flag to another member (fix plan 7.8). Demotes
 * the current primary first so the family never shows two "Primary" badges.
 */
export async function setPrimaryContact(familyMemberId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const db = getDb();
  const { data: member } = await db
    .from("family_members")
    .select("id, family_id")
    .eq("id", familyMemberId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!member) return { error: "Family member not found" };

  await db
    .from("family_members")
    .update({ is_primary_contact: false })
    .eq("firm_id", ctx.firmId)
    .eq("family_id", member.family_id)
    .eq("is_primary_contact", true);

  const { error } = await db
    .from("family_members")
    .update({ is_primary_contact: true })
    .eq("id", familyMemberId)
    .eq("firm_id", ctx.firmId);

  if (error) return { error: "Failed to update primary contact" };

  revalidatePath(`/families/${member.family_id}`);
  revalidatePath("/families");
  return { success: true };
}

// Archiving removes a client household from the roster — the same
// owner/admin lifecycle class as creating one (see requireClientIntake).
export async function archiveFamily(familyId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireClientIntake(ctx);
  } catch {
    return { error: "Only owners and admins can archive families" };
  }

  const db = getDb();
  const { error } = await db
    .from("families")
    .update({
      archived_at: new Date().toISOString(),
      updated_by_user_id: ctx.dbUserId,
    })
    .eq("id", familyId)
    .eq("firm_id", ctx.firmId);

  if (error) return { error: "Failed to archive family" };

  revalidatePath(`/families/${familyId}`);
  revalidatePath("/families");
  return { success: true };
}

export async function unarchiveFamily(familyId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireClientIntake(ctx);
  } catch {
    return { error: "Only owners and admins can restore families" };
  }

  const db = getDb();
  const { error } = await db
    .from("families")
    .update({
      archived_at: null,
      updated_by_user_id: ctx.dbUserId,
    })
    .eq("id", familyId)
    .eq("firm_id", ctx.firmId);

  if (error) return { error: "Failed to restore family" };

  revalidatePath(`/families/${familyId}`);
  revalidatePath("/families");
  return { success: true };
}

/**
 * Edit a family member (fix plan 8.9). Relationship is always editable;
 * name/email only while the linked user is still an unclaimed placeholder —
 * a claimed portal account owns its own identity.
 */
export async function updateFamilyMember(
  familyMemberId: string,
  formData: FormData
) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const relationshipType = formData.get("relationship_type") as string;
  if (!relationshipType) return { error: "Relationship is required" };

  const db = getDb();
  const { data: member } = await db
    .from("family_members")
    .select("id, family_id, user_id, users:user_id(auth_provider_user_id)")
    .eq("id", familyMemberId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!member) return { error: "Family member not found" };

  const { error } = await db
    .from("family_members")
    .update({ relationship_type: relationshipType })
    .eq("id", familyMemberId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to update family member" };

  const memberUser = (member as Record<string, unknown>).users as {
    auth_provider_user_id: string;
  } | null;
  const isPlaceholder =
    !!memberUser &&
    (memberUser.auth_provider_user_id.startsWith("invited_") ||
      memberUser.auth_provider_user_id.startsWith("pending_"));

  const firstName = (formData.get("first_name") as string)?.trim();
  const lastName = (formData.get("last_name") as string)?.trim();
  if (isPlaceholder && firstName && lastName) {
    // Service role (allowlisted in families.ts): placeholder users rows are
    // firm-managed contact records until claimed.
    const admin = createServerClient();
    await admin
      .from("users")
      .update({ first_name: firstName, last_name: lastName })
      .eq("id", member.user_id);
  }

  revalidatePath(`/families/${member.family_id}`);
  return { success: true };
}

/**
 * Remove a member from the household (fix plan 8.9). Leaves the users row
 * (and any portal account) intact — this only unlinks them from the family.
 */
export async function removeFamilyMember(familyMemberId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const db = getDb();
  const { data: member } = await db
    .from("family_members")
    .select("id, family_id")
    .eq("id", familyMemberId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!member) return { error: "Family member not found" };

  const { error } = await db
    .from("family_members")
    .delete()
    .eq("id", familyMemberId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to remove family member" };

  revalidatePath(`/families/${member.family_id}`);
  return { success: true };
}

/**
 * Deactivate a member's portal access (fix plan 8.9): their firm membership
 * flips to inactive so resolveUserAndFirm stops resolving this firm for
 * them. Owner/admin only — it's an access-revocation action.
 */
export async function deactivatePortalAccount(familyMemberId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireClientIntake(ctx);
  } catch {
    return { error: "Only owners and admins can deactivate portal access" };
  }

  const db = getDb();
  const { data: member } = await db
    .from("family_members")
    .select("id, family_id, user_id")
    .eq("id", familyMemberId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!member) return { error: "Family member not found" };

  const { error } = await db
    .from("firm_memberships")
    .update({ status: "inactive", updated_at: new Date().toISOString() })
    .eq("firm_id", ctx.firmId)
    .eq("user_id", member.user_id)
    .eq("role", "parent_guardian");
  if (error) return { error: "Failed to deactivate portal access" };

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "family_member",
    entityId: member.id,
    actionType: "portal_access_revoked",
    label: "Family portal access deactivated",
  });

  revalidatePath(`/families/${member.family_id}`);
  return { success: true };
}
