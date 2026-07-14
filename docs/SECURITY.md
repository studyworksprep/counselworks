# CounselWorks Security Model

**Status:** Phase 1 of `docs/FIX_PLAN.md` implemented. RLS enforcement is
code-complete and CI-tested; enabling it in production requires the two
external configuration steps in [Rollout](#rollout) below.

## Architecture: two enforcement layers

1. **Postgres RLS (tenancy + coarse role gates)** — migration
   `web/supabase/migrations/00016_rls_foundation.sql`. Every tenant table is
   scoped to the caller's firm via `public.firm_id()`, which resolves the
   Clerk JWT `sub` claim → `users` → active `firm_memberships` row.
   Staff-managed tables additionally require `public.is_staff()` for writes.
   Child tables without a `firm_id` (messages, meeting attendees, versions,
   workflow steps) are scoped through their parent. Message inserts must be
   sent as the authenticated user. The `users` table is restricted to
   self-or-same-firm visibility. `anon` has no grants at all.

2. **Application authorization (fine-grained)** — `web/src/lib/auth/authorize.ts`.
   Role-, assignment-, participation-, and `visibility_scope`-aware checks
   that RLS deliberately does not encode. Server actions call `requireStaff`,
   `requireDocumentAccess`, `requireConversationAccess`, and
   `requireTaskMutation` before touching records by ID. The decision logic is
   pure and locked by `web/tests/unit/authorize.test.ts` — fetch-by-UUID can
   never grant more than the corresponding portal list query.

RLS is defense in depth, not the sole enforcement: a forgotten `firm_id`
filter returns zero rows instead of another firm's data, and a compromised
or buggy query cannot cross tenants. Fine-grained visibility stays in the
app layer because those rules evolve with the product (see fix plan Phases
3 and 5, which relax specific write gates deliberately).

## Database clients

`web/src/lib/db/client.ts` exposes:

- **`getDb()`** — what all user-initiated reads/writes use. With
  `SUPABASE_USER_SCOPED_DB=true` it returns the user-scoped client (Clerk
  session token per request → RLS enforced as `authenticated`). Unset, it
  falls back to the service-role client and the app layer is the only
  enforcement — the pre-Phase-1 behavior.
- **`createUserClient()`** — the Clerk-token client behind `getDb()`.
- **`createServerClient()`** — service role, **bypasses RLS**. Allowlisted
  call sites only:
  - Clerk webhook (`src/app/api/webhooks/clerk`)
  - Inngest jobs (`src/lib/queue/functions.ts`)
  - identity bootstrap & invitation provisioning (`src/lib/auth/resolve.ts`,
    `src/lib/actions/invitations.ts`, staff invites in `settings.ts`,
    placeholder contacts in `families.ts`)
  - storage signing/uploads after app-layer authorization (`src/lib/storage`)
  - College Scorecard catalog sync (global `colleges` table has no client
    write policies: `actions/colleges.ts#syncCollegeScorecard`,
    `api/colleges/bulk-sync`, `actions/college-discrepancies.ts`)
  - ICS calendar feed (`api/calendar-feed/[token]`): external calendar apps
    authenticate with only the secret per-counselor token — no Clerk session
    exists to scope a user client. The token is unguessable (48 hex chars),
    rotatable, staff-only, and every query is explicitly firm-scoped.

  Adding a call site outside this list requires documenting why RLS cannot
  apply (CLAUDE.md security rule 2).

## Rollout — RLS enforcement cutover (fix plan 11.6)

Do this in a **staging** Supabase project first, get the isolation suite
green against it, then repeat in production. Roll back at any point by
unsetting `SUPABASE_USER_SCOPED_DB` — no code or schema change in either
direction.

1. **Clerk:** enable the Supabase integration for your Clerk instance
   (Clerk Dashboard → Integrations → Supabase), so session tokens carry the
   `"role": "authenticated"` claim Supabase expects.
2. **Supabase:** register Clerk as a third-party auth provider
   (Dashboard → Authentication → Sign In / Providers → Third-party Auth →
   Clerk, using your Clerk domain).
3. **Apply *all* migrations** (currently through `00031`). `00016` is the RLS
   foundation, but every later migration that creates a tenant table ships
   its own policies — they must all be present, not just `00016`.
4. **Prove isolation against the deployed DB** before flipping the flag:
   `psql "$DATABASE_URL" -f supabase/tests/isolation.sql` must print
   `isolation suite passed`. This runs as the `authenticated` role with a
   Clerk-style JWT — the same enforced path the flag turns on.
5. **Flip the flag:** set `SUPABASE_USER_SCOPED_DB=true` and deploy. `getDb()`
   now routes every user-initiated read/write through the Clerk-token client;
   RLS enforces tenancy underneath the app-layer checks (defense in depth).
6. **Smoke-test each persona** in the running app: counselor rosters load; a
   portal user cannot open another family's document by URL; financial
   (`aid_awards`), agreement (`service_agreements`), and per-user
   (`notifications`) data stays correctly scoped.
7. **Supabase Storage:** the `documents` bucket must have **no** permissive
   client policies (default). All storage access goes through server-signed
   URLs issued after `requireDocumentAccess`.

### Verify the crons actually fire

RLS enforcement doesn't touch Inngest jobs (they use the allowlisted
service-role client), but the cutover deploy is the moment to confirm the
scheduled work runs in the deployed environment (Phase-5/6 automation rule):

- Point the Inngest app at the deployed `/api/inngest` endpoint and confirm
  every cron registers: workflow deadline reminders + application deadline
  reminders + document-request reminders (daily 08:00 UTC), meeting reminders
  (hourly), message daily digest (13:00), weekly family digest (Mon 13:00),
  and workflow auto-advance (nightly 02:00).
- Trigger each once from the Inngest dashboard and confirm a success result
  (emails sent / notifications inserted) rather than an error.

## Isolation test suite

`web/supabase/tests/isolation.sql` impersonates each fixture persona
(`supabase/seed/test-fixtures.sql`: two firms — Alpha and Beta — each with
owner, counselor, parents, and a student) by assuming the `authenticated`
role with a Clerk-style JWT claim, then asserts **without any app-layer
filters**:

- unfiltered selects return only the caller's firm's rows (students,
  families, memberships, conversations, messages-via-parent);
- cross-firm reads, updates (even targeted by UUID), and inserts fail;
- the `users` table never exposes another firm's identities;
- portal roles cannot write staff-managed tables or grant themselves
  assignments;
- messages can only be inserted as oneself;
- Phase-10/11 tenant tables stay firm-scoped cross-firm (`document_requests`,
  `message_attachments`, `test_sittings`, `notifications`); students can
  fulfil a document request but not create one; `notifications` are per-user
  (a counselor cannot read another user's feed);
- unauthenticated sessions see zero tenant rows (the global college catalog
  is deliberately world-readable).

CI runs the suite on every PR against a clean Postgres with all migrations.
Locally: apply migrations + seeds, then
`psql "$DATABASE_URL" -f supabase/tests/isolation.sql`.

## Known limits (tracked in the fix plan)

- Portal roles can *read* firm-scoped rows of tenant tables at the DB layer
  (e.g. another family's `students` row); portal-facing SELECT filtering is
  app-layer by design. Tightening per-role read policies is a candidate
  hardening after Phase 3 settles the visibility model.
- `public.firm_id()` assumes one active firm per user (oldest membership
  wins), matching `resolveUserAndFirm()`. Multi-firm staff accounts need a
  session-scoped firm switch in both places.
- Parents are read-only in the app layer today; Phase 3 revisits.
- `modules/permissions/service.ts#canViewRecord` still uses a legacy
  `"counselor"` scope value the schema spells `"staff"`; superseded by
  `authorize.ts` and slated for cleanup.
