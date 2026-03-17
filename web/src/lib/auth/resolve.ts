import { auth, currentUser } from "@clerk/nextjs/server";
import { createServerClient } from "../db/client";

interface UserContext {
  userId: string;
  dbUserId: string;
  firmId: string;
  role: string;
}

const FIRM_WIDE_ROLES = new Set([
  "firm_owner",
  "firm_admin",
  "read_only_staff",
]);

/** Returns true if the role has implicit access to all students in the firm. */
export function isFirmWideRole(role: string): boolean {
  return FIRM_WIDE_ROLES.has(role);
}

/**
 * Returns the student IDs assigned to this user via student_staff_assignments.
 * Firm-wide roles get null (meaning "all students").
 */
export async function getAssignedStudentIds(
  ctx: UserContext
): Promise<string[] | null> {
  if (isFirmWideRole(ctx.role)) return null; // null = no filtering needed

  const db = createServerClient();
  const { data } = await db
    .from("student_staff_assignments")
    .select("student_id")
    .eq("firm_id", ctx.firmId)
    .eq("user_id", ctx.dbUserId);

  return (data ?? []).map((r) => r.student_id);
}

/**
 * Resolves the current Clerk user to their internal DB user and active firm.
 * If the user exists in Clerk but not in the database (e.g. webhook didn't
 * fire), auto-provisions the DB user and a default firm so the app remains
 * usable even when webhooks are misconfigured.
 *
 * Returns null only if the user is not authenticated with Clerk.
 */
export async function resolveUserAndFirm(): Promise<UserContext | null> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const db = createServerClient();

  // Look up internal user
  let { data: user } = await db
    .from("users")
    .select("id")
    .eq("auth_provider_user_id", clerkUserId)
    .single();

  // Auto-provision user if webhook hasn't synced them yet
  if (!user) {
    const clerkUser = await currentUser();
    if (!clerkUser) return null;

    const email =
      clerkUser.emailAddresses[0]?.emailAddress ?? "unknown@example.com";

    // Check if an invited placeholder user already exists with this email.
    // If so, claim it by updating the auth_provider_user_id to the real Clerk ID.
    const { data: placeholderUser } = await db
      .from("users")
      .select("id, auth_provider_user_id, first_name, last_name")
      .eq("email", email)
      .single();

    if (
      placeholderUser &&
      placeholderUser.auth_provider_user_id.startsWith("invited_")
    ) {
      // Only overwrite names if Clerk provides them; otherwise keep
      // what the admin entered on the invite form.
      const clerkFirst = clerkUser.firstName || "";
      const clerkLast = clerkUser.lastName || "";
      await db
        .from("users")
        .update({
          auth_provider_user_id: clerkUserId,
          first_name: clerkFirst || placeholderUser.first_name,
          last_name: clerkLast || placeholderUser.last_name,
          last_login_at: new Date().toISOString(),
        })
        .eq("id", placeholderUser.id);

      user = { id: placeholderUser.id };
    } else {
      const { data: newUser, error: userError } = await db
        .from("users")
        .insert({
          auth_provider_user_id: clerkUserId,
          email,
          first_name: clerkUser.firstName || "User",
          last_name: clerkUser.lastName || "",
          last_login_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (userError || !newUser) {
        console.error("Failed to auto-provision user:", userError);
        return null;
      }

      user = newUser;
    }
  }

  // Look up active firm membership (pick the first active one)
  let { data: membership } = await db
    .from("firm_memberships")
    .select("firm_id, role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  // Auto-provision a default firm if the user has none
  if (!membership) {
    const clerkUser = await currentUser();
    const firmName = clerkUser
      ? `${clerkUser.firstName || "My"}'s Practice`
      : "My Practice";
    const firmSlug = `firm-${clerkUserId.slice(-8)}-${Date.now()}`;

    const { data: firm, error: firmError } = await db
      .from("firms")
      .insert({ name: firmName, slug: firmSlug })
      .select("id")
      .single();

    if (firmError || !firm) {
      console.error("Failed to auto-provision firm:", firmError);
      return null;
    }

    // Create firm settings
    await db.from("firm_settings").insert({ firm_id: firm.id });

    // Create firm membership
    const { data: newMembership, error: memberError } = await db
      .from("firm_memberships")
      .insert({
        firm_id: firm.id,
        user_id: user.id,
        role: "firm_owner",
        status: "active",
        joined_at: new Date().toISOString(),
      })
      .select("firm_id, role")
      .single();

    if (memberError || !newMembership) {
      console.error("Failed to auto-provision firm membership:", memberError);
      return null;
    }

    membership = newMembership;
  }

  return {
    userId: clerkUserId,
    dbUserId: user.id,
    firmId: membership.firm_id,
    role: membership.role,
  };
}
