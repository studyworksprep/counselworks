# Golden-Path E2E — Setup & Runbook

The golden-path suite (`web/tests/e2e/golden-path.spec.ts`, fix plan 7.10) is
the live regression gate: one serial scenario driving owner → counselor →
student → two parents through the full client journey in a real browser,
against a real database and real Clerk dev-instance sessions.

**Without configuration the suite self-skips** (and CI's `e2e` job doesn't
run), so `npm run test:e2e` stays green everywhere until the pieces below
exist.

## How auth works (no UI scraping, no emails)

- `tests/e2e/global-setup.ts` calls `clerkSetup()` (@clerk/testing) to mint a
  testing token from the Clerk **development** instance keys.
- Personas are provisioned idempotently through the Clerk Backend API
  (`ensureClerkUser`) using `+clerk_test` addresses (Clerk test identities:
  no real email traffic), then signed in with ticket-based `clerk.signIn`.
- The two staff logins are pre-staged in the database as claimable
  `invited_` placeholders (`web/supabase/seed/e2e-users.sql`); the student
  and parents are invited *during the scenario* and claimed by the app's
  email-match path on first sign-in — the same path a real invitee takes.

## One-time configuration (owner action items)

1. **Clerk development instance** (never production):
   - Note its **publishable key** and **secret key**.
   - No manual test users needed — the suite creates them via the Backend
     API. Make sure email/password+email-code sign-in is enabled (default).
2. **Resend**: an API key whose account has a **verified sending domain**
   (invite sends to arbitrary run-unique addresses fail on unverified
   accounts, and the invite actions surface that as a user-facing error).
   Set `RESEND_FROM_ADDRESS` to an address on that domain.
3. **Local runs** — put in `web/.env.e2e` (or export):
   ```bash
   E2E_BASE_URL=http://localhost:3000        # app under test
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…
   CLERK_SECRET_KEY=sk_test_…
   RESEND_API_KEY=re_…
   RESEND_FROM_ADDRESS="CounselWorks <noreply@yourverifieddomain>"
   # optional overrides (defaults shown)
   E2E_OWNER_EMAIL=e2e-owner+clerk_test@example.com        # must match e2e-users.sql
   E2E_COUNSELOR_EMAIL=e2e-counselor+clerk_test@example.com
   E2E_INVITE_EMAIL_DOMAIN=example.com
   ```
   The app itself needs its usual env plus the SAME Clerk dev keys, and its
   database must have all migrations, `supabase/seed/seed.sql`,
   `supabase/seed/test-fixtures.sql`, and `supabase/seed/e2e-users.sql`
   applied. Easiest local path: `supabase start && supabase db reset` from
   `web/` (config.toml wires all three seeds), point the app at the local
   stack, `npm run dev`, then `npm run test:e2e`.
4. **CI (GitHub → repo Settings)**:
   - Secrets: `E2E_CLERK_PUBLISHABLE_KEY`, `E2E_CLERK_SECRET_KEY`,
     `E2E_RESEND_API_KEY`.
   - Variables: `E2E_ENABLED=true` (this switches the `e2e` job on),
     `E2E_RESEND_FROM_ADDRESS`, optionally `E2E_INVITE_EMAIL_DOMAIN`.
   - The job boots a local Supabase stack (`supabase db reset` applies every
     migration + all three seeds), builds and starts the app, runs the
     Inngest dev server for background jobs, and runs the suite headless.

## Semantics & known deviations

- The suite generates run-unique names/emails, so it can re-run against the
  same database without cleanup.
- Step 7 asserts the in-app message exchange; the Resend notification email
  is not observable from a browser.
- Step 10 exercises the essay review-status loop; the AI coach review
  (Anthropic API) is deliberately out of the gate to keep CI deterministic.
- Step 12 asserts route-level denials; row-level isolation is enforced by
  `supabase/tests/isolation.sql` + `tests/unit/authorize.test.ts` in the
  same pipeline.
- `SUPABASE_USER_SCOPED_DB` stays unset against the local stack (no Clerk
  third-party-auth config there); the app-layer authorization module is the
  enforcement under test, RLS is covered by the isolation suite.
