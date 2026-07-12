/**
 * E2E environment contract (fix plan 7.10). The golden-path suite runs only
 * when Clerk test-auth is configured; otherwise it self-skips with a pointer
 * at docs/E2E.md so `npm run test:e2e` stays green on unconfigured machines.
 */

export interface E2EEnv {
  /** Owner/admin staff login — must match supabase/seed/e2e-users.sql. */
  ownerEmail: string;
  /** Plain-counselor staff login — must match supabase/seed/e2e-users.sql. */
  counselorEmail: string;
  /**
   * Domain for run-unique portal-invite emails. Every generated address
   * contains "+clerk_test" (Clerk test identity: no real email, code 424242 /
   * ticket sign-in). Resend must be able to accept sends to this domain —
   * any domain works once the RESEND_API_KEY account has a verified sender.
   */
  inviteDomain: string;
}

export function e2eEnv(): E2EEnv | null {
  const hasClerkKeys =
    !!process.env.CLERK_SECRET_KEY &&
    !!(
      process.env.CLERK_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    );
  if (!hasClerkKeys || process.env.E2E_GOLDEN_PATH === "0") return null;
  return {
    ownerEmail:
      process.env.E2E_OWNER_EMAIL ?? "e2e-owner+clerk_test@example.com",
    counselorEmail:
      process.env.E2E_COUNSELOR_EMAIL ??
      "e2e-counselor+clerk_test@example.com",
    inviteDomain: process.env.E2E_INVITE_EMAIL_DOMAIN ?? "example.com",
  };
}
