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

export { STAFF_ROLE_LIST, isStaffRole } from "../constants/roles";

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
 * fire), creates the users row; formally invited users are claimed
 * automatically (metadata or pending-invitation email match). Firms are
 * NEVER created here — see actions/onboarding.ts and /welcome.
 *
 * Returns null when the caller is not authenticated OR is authenticated but
 * unaffiliated (no firm membership); layouts route the latter to /welcome
 * via resolveAffiliation().
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
    // currentUser() is a Clerk Backend API call and can fail transiently —
    // notably 429, which Clerk returns with a retryAfter. Letting it throw
    // renders Next's raw error page to the user, against this repo's own
    // convention of returning typed error states rather than throwing at the
    // UI. Callers already treat null as "not resolvable" and redirect.
    let clerkUser: Awaited<ReturnType<typeof currentUser>> = null;
    try {
      clerkUser = await currentUser();
    } catch (err) {
      console.error("Clerk currentUser() failed during resolution:", err);
      return null;
    }
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

    // Fall back to the email-match path — but ONLY when the placeholder has
    // a pre-staged firm membership. Every deliberate grant pre-stages one
    // (staff invites, portal invites, the E2E staff seed), so a membership
    // is the firm's explicit intent to let this verified address in. A
    // placeholder that was merely ADDED (family member / student created
    // with an email, never invited) has no membership and is NOT silently
    // claimed: that user gets the explicit /welcome link flow, where they
    // confirm the affiliation themselves. Claiming added-not-invited rows
    // silently is how a parent who wandered in from an agreement email used
    // to end up owning a brand-new empty firm.
    if (!placeholderUser) {
      const { data } = await db
        .from("users")
        .select("id, auth_provider_user_id, first_name, last_name")
        .eq("email", email)
        .single();
      if (data && data.auth_provider_user_id.startsWith("invited_")) {
        const { data: prestaged } = await db
          .from("firm_memberships")
          .select("id")
          .eq("user_id", data.id)
          .limit(1)
          .maybeSingle();
        if (prestaged) {
          placeholderUser = data;
        } else {
          // Known client record, no membership: leave the placeholder
          // untouched and DO NOT insert a fresh users row (it would collide
          // with users_email_key). The caller is "unaffiliated" until they
          // link explicitly on /welcome.
          return null;
        }
      } else if (data) {
        // The email belongs to an already-claimed row under a different
        // login. Never link or duplicate it.
        return null;
      }
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
        // A first sign-in usually arrives as several concurrent requests
        // (page + prefetch + server action). They all miss the lookup above,
        // then race here: one wins, the rest violate
        // users_auth_provider_user_id_key. Losing that race is not an error —
        // the row we wanted now exists, so adopt it. Without this the loser
        // returns null and the caller behaves as though the user were signed
        // out, which is how a family member could silently fail to save.
        const lostInsertRace =
          userError?.code === "23505" &&
          (userError.message?.includes("auth_provider_user_id") ?? false);

        if (lostInsertRace) {
          const { data: raced } = await db
            .from("users")
            .select("id")
            .eq("auth_provider_user_id", clerkUserId)
            .maybeSingle();
          if (raced) {
            user = raced;
          } else {
            console.error(
              "Auto-provision hit a unique violation but the row is not findable:",
              userError
            );
            return null;
          }
        } else {
          // A distinct conflict — e.g. users_email_key, meaning some other row
          // already owns this email and was not claimable. Retrying cannot fix
          // that, so surface it.
          console.error("Failed to auto-provision user:", userError);
          return null;
        }
      } else {
        user = newUser;
      }
    }
  }

  // Look up active firm membership. The ORDER BY is load-bearing, not
  // cosmetic: public.firm_id() (migration 00016) resolves the caller's tenant
  // as the OLDEST active membership, so this must use the same rule. Without
  // it Postgres may return any matching row, and once
  // SUPABASE_USER_SCOPED_DB=true the app context and RLS can land on
  // different firms for a multi-membership user — every query then returns
  // zero rows. Multi-firm staff accounts still need a session-scoped firm
  // switch in both places (docs/SECURITY.md, "Known limits").
  const { data: membership } = await db
    .from("firm_memberships")
    .select("firm_id, role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  // No membership: the caller is authenticated but unaffiliated. Firms are
  // NEVER provisioned implicitly anymore — a signed-in visitor with no firm
  // is routed to /welcome, where counselors create a firm as a deliberate
  // action and known clients link their account explicitly (see
  // actions/onboarding.ts). The old auto-provision-on-any-request behavior
  // made a client who wandered in from an agreement email the owner of a
  // brand-new empty firm.
  if (!membership) return null;

  return {
    userId: clerkUserId,
    dbUserId: user.id,
    firmId: membership.firm_id,
    role: membership.role,
  };
}

// ---------------------------------------------------------------------------
// Onboarding affiliation (fix plan 2.2, completed 2026-08-13)
// ---------------------------------------------------------------------------

export type ClientLinkage = {
  placeholderUserId: string;
  kind: "student" | "parent";
  firmId: string;
  firmName: string;
  householdName: string | null;
};

/**
 * Finds the client record (added by a firm, never yet claimed) behind a
 * Clerk-verified email: an `invited_` users row referenced by either a
 * family_members or a students row. Powers the /welcome guided-link flow.
 * Service role (allowlisted): identity bootstrap for a session that cannot
 * yet satisfy RLS.
 */
export async function findClientLinkageByEmail(
  email: string
): Promise<ClientLinkage | null> {
  const db = createServerClient();
  const { data: placeholder } = await db
    .from("users")
    .select("id, auth_provider_user_id")
    .eq("email", email)
    .maybeSingle();
  if (
    !placeholder ||
    !placeholder.auth_provider_user_id.startsWith("invited_")
  ) {
    return null;
  }

  const [{ data: familyMember }, { data: student }] = await Promise.all([
    db
      .from("family_members")
      .select("firm_id, families:family_id(household_name), firms:firm_id(name)")
      .eq("user_id", placeholder.id)
      .limit(1)
      .maybeSingle(),
    db
      .from("students")
      .select("firm_id, firms:firm_id(name)")
      .eq("user_id", placeholder.id)
      .limit(1)
      .maybeSingle(),
  ]);

  const one = <T>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;

  if (familyMember) {
    return {
      placeholderUserId: placeholder.id,
      kind: "parent",
      firmId: familyMember.firm_id,
      firmName:
        one(familyMember.firms as { name: string } | { name: string }[] | null)
          ?.name ?? "your counseling firm",
      householdName:
        one(
          familyMember.families as
            | { household_name: string }
            | { household_name: string }[]
            | null
        )?.household_name ?? null,
    };
  }
  if (student) {
    return {
      placeholderUserId: placeholder.id,
      kind: "student",
      firmId: student.firm_id,
      firmName:
        one(student.firms as { name: string } | { name: string }[] | null)
          ?.name ?? "your counseling firm",
      householdName: null,
    };
  }
  return null;
}

export type Affiliation =
  | { status: "unauthenticated" }
  | { status: "member"; ctx: UserContext }
  | { status: "unaffiliated"; clerkUserId: string; email: string | null };

/**
 * Layout/welcome-page resolution: distinguishes signed-out visitors from
 * authenticated users who have no firm yet (who belong on /welcome).
 */
export async function resolveAffiliation(): Promise<Affiliation> {
  const { userId } = await auth();
  if (!userId) return { status: "unauthenticated" };
  const ctx = await resolveUserAndFirm();
  if (ctx) return { status: "member", ctx };
  let email: string | null = null;
  try {
    const clerkUser = await currentUser();
    email = clerkUser?.emailAddresses[0]?.emailAddress ?? null;
  } catch {
    // Transient Clerk failure: still route to /welcome; the page degrades
    // to the generic two-door screen.
  }
  return { status: "unaffiliated", clerkUserId: userId, email };
}
