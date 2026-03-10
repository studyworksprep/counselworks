import { auth, currentUser } from "@clerk/nextjs/server";
import { createServerClient } from "../db/client";

interface UserContext {
  userId: string;
  dbUserId: string;
  firmId: string;
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

    const { data: newUser, error: userError } = await db
      .from("users")
      .insert({
        auth_provider_user_id: clerkUserId,
        email:
          clerkUser.emailAddresses[0]?.emailAddress ?? "unknown@example.com",
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

  // Look up active firm membership (pick the first active one)
  let { data: membership } = await db
    .from("firm_memberships")
    .select("firm_id")
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
      .select("firm_id")
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
  };
}
