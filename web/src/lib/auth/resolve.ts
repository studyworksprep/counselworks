import { auth } from "@clerk/nextjs/server";
import { createServerClient } from "../db/client";

interface UserContext {
  userId: string;
  dbUserId: string;
  firmId: string;
}

/**
 * Resolves the current Clerk user to their internal DB user and active firm.
 * Returns null if the user is not authenticated or has no firm membership.
 */
export async function resolveUserAndFirm(): Promise<UserContext | null> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const db = createServerClient();

  // Look up internal user
  const { data: user } = await db
    .from("users")
    .select("id")
    .eq("auth_provider_user_id", clerkUserId)
    .single();

  if (!user) return null;

  // Look up active firm membership (pick the first active one)
  const { data: membership } = await db
    .from("firm_memberships")
    .select("firm_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (!membership) return null;

  return {
    userId: clerkUserId,
    dbUserId: user.id,
    firmId: membership.firm_id,
  };
}
