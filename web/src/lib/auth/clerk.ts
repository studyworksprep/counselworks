import { auth } from "@clerk/nextjs/server";

interface CurrentUser {
  userId: string;
  sessionId: string | null;
  sessionClaims: Record<string, unknown> | null;
}

/**
 * Get the current authenticated user from Clerk.
 * Returns null if the user is not signed in.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const { userId, sessionId, sessionClaims } = await auth();

  if (!userId) {
    return null;
  }

  return {
    userId,
    sessionId,
    sessionClaims: sessionClaims as Record<string, unknown> | null,
  };
}

/**
 * Require authentication. Throws an error if the user is not signed in.
 * Returns the authenticated user information.
 */
export async function requireAuth(): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Authentication required");
  }

  return user;
}

/**
 * Get the active firm ID for the current user from their session claims.
 * Returns null if the user is not signed in or has no firm assigned.
 */
export async function getUserFirmId(): Promise<string | null> {
  const user = await getCurrentUser();

  if (!user || !user.sessionClaims) {
    return null;
  }

  const metadata = user.sessionClaims.metadata as
    | { firm_id?: string }
    | undefined;

  return metadata?.firm_id ?? null;
}
