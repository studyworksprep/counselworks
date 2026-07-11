import { auth, currentUser } from "@clerk/nextjs/server";
import { createServerClient, getDb } from "../db/client";

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

// Keep in sync with public.is_staff() in migration 00016.
export const STAFF_ROLE_LIST = [
  "firm_owner",
  "firm_admin",
  "counselor",
  "essay_coach",
  "tutor",
  "read_only_staff",
] as const;

const STAFF_ROLES = new Set<string>(STAFF_ROLE_LIST);

/** Returns true if the role has implicit access to all students in the firm. */
export function isFirmWideRole(role: string): boolean {
  return FIRM_WIDE_ROLES.has(role);
}

/**
 * Returns true if the role is a member of firm staff (counselor, coach, tutor,
 * admin, owner, read-only staff). False for student and parent_guardian roles.
 */
export function isStaffRole(role: string): boolean {
  return STAFF_ROLES.has(role);
}

/**
 * Returns the student IDs assigned to this user via student_staff_assignments.
 * Firm-wide roles get null (meaning "all students").
 */
export async function getAssignedStudentIds(
  ctx: UserContext
): Promise<string[] | null> {
  if (isFirmWideRole(ctx.role)) return null; // null = no filtering needed

  const db = getDb();
  const { data } = await db
    .from("student_staff_assignments")
    .select("student_id")
    .eq("firm_id", ctx.firmId)
    .eq("user_id", ctx.dbUserId);

  return (data ?? []).map((r) => r.student_id);
}

/**
 * True when a users row is an unclaimed placeholder rather than a real
 * account. "invited_" is the current prefix; "pending_" is the legacy one —
 * rows created by older builds during mixed-version windows must never be
 * mistaken for active accounts.
 */
export function isPlaceholderUser(authProviderUserId: string): boolean {
  return (
    authProviderUserId.startsWith("invited_") ||
    authProviderUserId.startsWith("pending_")
  );
}

/**
 * True when Clerk public metadata marks this account as a portal invitee
 * (student or parent). Invited users must NEVER be auto-provisioned as the
 * owner of a brand-new firm — their membership is pre-staged at invite time.
 */
export function isPortalInviteMetadata(
  metadata: unknown
): metadata is { kind: string; placeholder_user_id?: string } {
  if (!metadata || typeof metadata !== "object") return false;
  const kind = (metadata as { kind?: unknown }).kind;
  return kind === "student_invite" || kind === "parent_invite";
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

  // Service role (allowlisted): identity bootstrap. Claims invitation
  // placeholders and auto-provisions users/firms for sessions that cannot
  // yet satisfy RLS (their rows don't exist or aren't linked yet).
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

    // First, look for a placeholder pointed to by Clerk invitation metadata.
    // This is the path used by student portal invites: the invite carries the
    // exact placeholder_user_id, so we don't have to rely on email matching.
    const metadata = clerkUser.publicMetadata as
      | { kind?: string; placeholder_user_id?: string; student_id?: string }
      | null;

    let placeholderUser: {
      id: string;
      auth_provider_user_id: string;
      first_name: string;
      last_name: string;
    } | null = null;

    if (
      isPortalInviteMetadata(metadata) &&
      typeof metadata.placeholder_user_id === "string"
    ) {
      const { data } = await db
        .from("users")
        .select("id, auth_provider_user_id, first_name, last_name")
        .eq("id", metadata.placeholder_user_id)
        .single();
      if (data && data.auth_provider_user_id.startsWith("invited_")) {
        placeholderUser = data;
      }
    }

    // Fall back to the email-match path (legacy/non-invite signups)
    if (!placeholderUser) {
      const { data } = await db
        .from("users")
        .select("id, auth_provider_user_id, first_name, last_name")
        .eq("email", email)
        .single();
      if (data) placeholderUser = data;
    }

    // Deliberately strict: only "invited_" rows are claimable. Legacy
    // "pending_" placeholders were never sent an invitation, so an arbitrary
    // signup with a matching email must not be linked to them. Invite actions
    // normalize pending_ → invited_ before creating the Clerk invitation
    // (see normalizePlaceholderPrefix in actions/invitations.ts).
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

      // Mark any pending invitation tied to this placeholder as accepted.
      const acceptedAt = new Date().toISOString();
      await Promise.all([
        db
          .from("student_invitations")
          .update({ status: "accepted", accepted_at: acceptedAt })
          .eq("placeholder_user_id", placeholderUser.id)
          .eq("status", "pending"),
        db
          .from("family_invitations")
          .update({ status: "accepted", accepted_at: acceptedAt })
          .eq("placeholder_user_id", placeholderUser.id)
          .eq("status", "pending"),
      ]);

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

    // Portal invitees have their membership pre-staged at invite time. If it
    // is missing, something went wrong with the invitation — bounce rather
    // than provisioning this student/parent as the OWNER of a new empty firm.
    if (clerkUser && isPortalInviteMetadata(clerkUser.publicMetadata)) {
      console.error(
        "Invited portal user has no firm membership; refusing to auto-provision:",
        clerkUser.id
      );
      return null;
    }

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
