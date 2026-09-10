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
- The dev instance hard-caps at 100 users and each run creates ~5, so
  global setup deletes run-suffixed `+clerk_test` users older than an hour
  (`cleanupStaleTestUsers` in `tests/e2e/helpers/clerk.ts`) before the
  suite starts. The stable staff logins are never touched. Without this the
  quota fills after ~20 runs and every PR's gate fails with
  `user_quota_exceeded` (403) — which is how it went red on 2026-08-13.
- Stripe (fix plan 12.4): CI maps `E2E_STRIPE_SECRET_KEY` /
  `E2E_STRIPE_PUBLISHABLE_KEY` (test-mode keys of the "CounselWorks"
  sandbox) into `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
  The connect spec creates one real test connected account per run, tagged
  with the fixture firm id; golden-path step 4 additionally manufactures a
  charges-enabled account via the test-token recipe and pays through real
  Stripe-hosted Checkout. Webhooks reach the app through
  `stripe listen --forward-connect-to` (the CLI's signing secret is
  exported as `STRIPE_WEBHOOK_SECRET` before the app starts). Global setup
  deletes stale fixture-tagged accounts (`cleanupStaleStripeTestAccounts`
  in `tests/e2e/helpers/stripe.ts`). The payments specs and step 4 skip
  when the key is absent.

## One-time configuration (owner action items)

1. **Clerk development instance** (never production):
   - Note its **publishable key** and **secret key**.
   - No manual test users needed — the suite creates them via the Backend
     API. Make sure email/password+email-code sign-in is enabled (default).
2. **Resend**: an API key whose account has a **verified sending domain**
   (invite sends to arbitrary run-unique addresses fail on unverified
   accounts, and the invite actions surface that as a user-facing error).
   Set `RESEND_FROM_ADDRESS` to an address on that domain.
3. **Local runs** — put in `web/.env.e2e` (or export). `playwright.config.ts`
   loads that file automatically; anything already exported wins over it, and
   the file is gitignored so the real keys below can't be committed:
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
   - The job sets `E2E_REQUIRE_LIVE=true`, so a missing or misnamed secret
     fails the build instead of self-skipping to a false green. Anywhere else
     (including the `quality` job) the suite still skips quietly.

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

## Workflow Phase E acceptance still required

`task-notifications.sql` runs transactional and authorization checks in the migration job. Unit tests exercise the actual reminder handler with an injected timer and fake transport; this does not prove Inngest cron delivery. The golden path now checks consolidated publication and reviewer/changes-requested task links. Without Clerk test keys these browser checks skip.

Before release, start the configured disposable app/Supabase/Inngest environment with fictional counselor, student, selected parent and second parent. Observe an actual scheduled `workflow-deadline-reminders` execution (including an overdue owner task and a submitted reviewer task), then verify feed delivery and test-provider receipts. Repeat execution within the same firm day and confirm one notice/receipt per recipient/task. Disable task email and verify the in-app notice still appears. Revoke audience or membership before the drain and verify no email is sent. Exercise assignment → submission → changes → resubmission → approval and confirm the next action/person only includes currently visible work. Use test recipients exclusively; do not run these checks on production records. Record scheduler execution IDs and persona outcomes before marking the Phase E live gate complete.


## UX1 preserved-review acceptance

`E2E_UX_REVIEW=1 npm run test:e2e -- ux1-review.spec.ts` runs four read-only checks
against the existing fictional UX review identities documented in
`UX_UI_IMPLEMENTATION_PLAN.md`. It requires the localhost review database: Olivia,
Carl, Sam, and Paula's `cw-ux-*+clerk_test@example.com` accounts; the four active staff
memberships (including the two E2E staff); Sam's Junior Year Anchors tasks; and Paula's
already-completed budget task. It does not provision/reset fixtures or mutate their
roles/task states. Without the opt-in it skips, since CI's fresh database does not
have these review records. The regular golden-path step 8a carries UX1 checks using
its own run-created clients instead.

September 9 UX1 run: all four targeted checks passed. The full suite passed booking
after its timezone selector was changed to a supported zone, but upload failed at
Inngest event publication: local app lacks `INNGEST_EVENT_KEY`/a dev server. Run the
local Inngest stack with the matching app `INNGEST_DEV=1` configuration before
retrying the full gate. Do not use dev mode in deployment or count the skipped
Stripe checks as passes. No Resend transport is configured in this review environment.

## UX2 responsive acceptance

`E2E_UX_REVIEW=1 npm run test:e2e -- ux1-review.spec.ts ux2-responsive.spec.ts`
runs the preserved-fixture role checks plus four responsive checks. UX2 covers owner
and counselor student overview/tasks at 390, 768, 1024, 1057, and 1366 px with
navigation preferences; student and parent task details/dashboards at 390/1366;
keyboard section overflow and task opening; task sorting; and scoped axe checks.
Long names/large balances are temporary DOM text replacements only. No fixture
records are changed by these specs. Screenshots are written to the ignored
`web/test-results/ux2-responsive-*/` directories and overwritten on the next run.
The normal golden-path step 8a includes narrow embedded-task checks but still
depends on earlier upload/Inngest setup. See the UX2 implementation record for
actual run results and the remaining billing-layout limitation.

September 9 UX2 final build: all eight UX1/UX2 checks passed. Full opt-in suite:
18 passed, 1 failed at upload/Inngest, 3 skipped, 11 not run. Both responsive
roster selectors and booking passed; downstream golden-path step 8a was not run.

## UX3 task semantics acceptance

`E2E_UX_REVIEW=1 npm run test:e2e -- ux3-tasks.spec.ts` uses the preserved local
review identities plus temporary tasks/workflow rows identified by generated UUIDs.
Its localhost guard prevents running fixture writes against remote Supabase. The
three live journeys cover status filters, review count and permissions, personal
versus waiting counts, weekly workflow destination, staff recovery, canonical
message links, hidden context denial, and parent navigation. Cleanup removes only
this run's generated rows, including recovered tasks; original review data stays
intact. No messages are sent by this spec. Normal golden-path step 8a also carries
status/ownership checks, and still depends on prior upload/Inngest setup. See the
UX3 phase record for final run counts and remaining release gates.

September 10 UX3 final full run: **21 passed, 1 failed (upload/Inngest),
3 skipped, 11 not run**. All eleven UX1–UX3 live checks and staff axe passed.
Booking uses the slot's pressed-state button and verifies a time plus timezone
label, preserving date-specific daylight-saving abbreviations.
