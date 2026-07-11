# CounselWorks — Engineering Guide

Multi-tenant SaaS for private college counseling firms. Next.js 16 (App Router) +
Clerk (auth) + Supabase (Postgres/storage) + Inngest (jobs) + Resend (email), in `web/`.

Three personas, three surfaces: **staff** `(dashboard)`, **students** `(student-portal)`,
**parents** `(family-portal)`. Almost every feature must work across all three.

**Read `docs/FIX_PLAN.md` before structural work** — it is the active roadmap and records
known defects. Do not re-introduce anything it removes.

## Where the real code lives

- Live data layer: `src/lib/db/queries.ts` + server actions in `src/lib/actions/*`.
- Live modules: `src/modules/{permissions,reports,workflows}` only. Other `src/modules/*`
  directories were dead scaffolding (never imported, referencing nonexistent columns) and
  are deleted. **Do not recreate parallel service layers.** New data access goes in
  `src/lib/db/queries.ts` and `src/lib/actions/`.
- Auth resolution: `src/lib/auth/resolve.ts` (Clerk user → `users` row → `firm_memberships`
  role). Role decides portal routing in each route group's `layout.tsx`.
- Background jobs: `src/lib/queue/functions.ts`, served at `src/app/api/inngest/route.ts`.

## Commands

Run from `web/`: `npm run dev` · `npm run build` · `npm run lint` · `npm run type-check`
(plus `npm test` / Playwright once Phase 0 of the fix plan lands). Type-check must pass
before any commit.

## Definition of Done — every feature, no exceptions

This codebase was audited and its recurring defect was **half-wired features**: schema
without UI, UI without write paths, actions without callers, jobs without producers,
portals showing permanently-empty states. A feature is done only when ALL of these hold:

1. **End-to-end wiring.** Schema → query → server action → staff UI → portal surfaces →
   test. If you write a server action, something must call it. If you add a column, it has
   both a write path and a read path *in the UI* — otherwise don't add it.
2. **All three personas checked.** Before calling anything done, answer explicitly: what
   does the counselor see? The student? The parent? If a portal page can render data that
   no code path can ever produce (e.g., a badge for a status nothing writes), the feature
   is not done.
3. **Explicit visibility decision.** Never hardcode `visibility_scope: "staff"` (or any
   scope) as an incidental default. Every creation path either exposes an audience control
   in the UI or documents a deliberate default in a code comment. Portal queries filter by
   scope — a wrong default makes the feature invisible to clients and *looks* like it works.
4. **Both directions of an enum agree.** Enum values are defined once, in one shared
   constants module, imported by every writer and every label map. (Historical bug: two
   creation paths wrote `early_action` vs `ea`, silently breaking deadline anchors and
   labels.) Never introduce a second spelling of an existing enum.
5. **No orphaned automation.** Never register an Inngest function without something that
   emits its event, and never emit an event without a handler. Crons must be verified to
   actually fire in dev before merge.
6. **Edit forms default every field.** Every edit form initializes all inputs from current
   values, and update actions must not null a column because a field was absent from the
   form. (Historical bug: editing a meeting silently unlinked its student.)
7. **No silent discards.** If user input can't be persisted or acted on, fail loudly or
   remove the field. (Historical bug: "Student Email" on the create form was dropped on
   the floor when no matching user existed.)

## Security rules (non-negotiable)

Data here includes minors' educational records, family financials, and counselors'
private notes. Treat every access decision as high-stakes.

1. **Tenancy on every query.** Every tenant-table query is scoped by `firm_id` — no
   exceptions, even for "internal" paths. Until Phase 1 of the fix plan lands (RLS via
   Clerk-authenticated clients), the service-role client bypasses RLS, so a missing filter
   is a cross-tenant data leak, not a bug.
2. **Service-role client is allowlisted.** `createServerClient()` (service role) is only
   for: the Clerk webhook, Inngest jobs, invitation claiming/provisioning, and Scorecard
   sync. User-initiated reads/writes use the user-scoped client once it exists. Never add
   a service-role call site without documenting why RLS cannot apply.
3. **Authorization is centralized.** Access checks live in the shared authorization
   helpers (`src/lib/auth/`), not inline in individual actions. Checking `firm_id` alone
   is NOT authorization: verify role, staff assignment, conversation participation, and
   document `visibility_scope` as applicable. Fetch-by-UUID endpoints need the same checks
   as list endpoints (historical hole: portal users could download staff-only documents
   by ID).
4. **New tenant tables ship with RLS.** Every migration creating a tenant table includes
   `firm_id`, enables RLS, and adds the tenant policy. New sensitive read/write paths get
   an isolation test (firm A must see zero rows of firm B; portal roles must be denied
   staff-scoped rows).
5. **Never expose counselor-private fields to portals.** `financial_notes_private`,
   `counselor_fit_rating`, `interest_level`, `internal_rating`, `risk_flags_json`,
   `counselor_strategy_notes`, and staff-scoped notes must never appear in portal queries'
   select lists.

## Codebase conventions

- **Migrations:** sequential `000NN_description.sql` in `web/supabase/migrations/`. Never
  edit an existing migration; always add a new one. Keep seed templates (workflows) in
  migrations consistent with the pattern of 00011 (delete-and-replace, documented intent).
- **Server actions:** validate input with zod, resolve the user/firm via
  `resolveUserAndFirm`, authorize, mutate, then `revalidatePath`. Return typed error
  states; do not throw raw errors at the UI.
- **Queries:** live in `queries.ts` with explicit select lists (no `select('*')` on tables
  with private fields destined for portals).
- **UI:** server components for reads, client components for interactivity; Tailwind;
  match the existing page patterns (`families/`, `students/` are good references).
- **Email:** all sends go through `src/lib/email/index.ts` templates with HTML escaping.
  No inline HTML strings in actions.

## Verification checklist before ending a work session

- `npm run type-check` and `npm run lint` pass.
- The golden-path E2E suite passes (once it exists); new user-facing behavior extends it.
- You have exercised the feature as each affected persona (counselor, student, parent) —
  in the running app, not just by reading code.
- Grep for what you added: every new action has a caller, every new event has a producer
  and consumer, every new column has a writer and a reader.
- No new `visibility_scope` hardcoding, no new service-role call sites outside the
  allowlist, no new enum spellings.
