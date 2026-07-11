# CounselWorks Fix Plan — Golden Path + Security Remediation

**Status:** Proposed
**Scope basis:** Full codebase audit (July 2026) tracing the two-year client journey
(10th-grade signup → final decisions) through every route, server action, query, migration,
and background job.
**Assumption:** No production clients; no data-retention constraints. Breaking migrations are allowed.

---

## 1. Goal

Deliver one complete, secure "golden path": a counselor signs a new family, onboards the
student and parents into their portals, runs intake, manages the multi-year roadmap,
builds a college list, runs application season (applications, essays, deadlines), records
decisions, and keeps the family informed — entirely inside CounselWorks, with tenant
isolation enforced at the database and role/visibility rules enforced in one auditable place.

### The golden-path acceptance scenario (end state)

This scenario must pass as an automated E2E test (Playwright) and defines "done":

1. A **counselor** (role `counselor`, not owner/admin) signs in, creates a family, adds two
   parents, and creates a 10th-grade student.
2. Counselor sends portal invitations to the **student and both parents**; all three accept
   and land in the correct portals (student portal / family portal). No manual DB steps.
3. Counselor records intake data: profile fields (citizenship, budget range, aid interest,
   geographic preferences, target school type) and test scores. Recommendations and fit
   analysis reflect this data.
4. Counselor schedules a kickoff **meeting with the student and a parent as attendees**;
   it appears in both portals; editing the meeting does not silently drop data.
5. A parent **uploads a transcript** from the family portal; the counselor sees it. The
   counselor uploads a document visible to the family; the parent can download it —
   and cannot download staff-only documents by any means.
6. Counselor applies the **Sophomore Year Anchors** workflow; the student sees their tasks
   in the portal and completes one; the linked workflow step completes.
7. Counselor starts a **conversation with the parent**; the parent sees it in the family
   portal, replies, and the counselor is notified by email.
8. (Junior year) Counselor builds the college list from Discover/Recommend, with categories
   and rounds; fit analysis renders; counselor adds a research note and a general student note.
9. (Senior year) Counselor creates an application from the list; an **application detail
   page** shows an editable deadline and a requirements checklist; the per-college
   supplement workflow anchors to the real deadline.
10. Counselor creates an essay, **shares it with the student**; the student edits a draft in
    the portal; the counselor runs coach review and marks it final; the essay is linked to
    the college/application.
11. Counselor **records the decision** (accepted/waitlisted/denied + date); badges appear in
    both portals; the Decision Outcomes report populates.
12. **Isolation tests pass**: firm A cannot read firm B's rows even with an app-layer filter
    deliberately removed; a parent cannot read staff conversations, staff-only documents,
    or another family's data; a student cannot mutate another student's tasks.

---

## 2. Guiding decisions

1. **Fix in place; no rewrite.** The schema and the workflow/college/essay subsystems are
   sound. Defects are point defects at enumerable joints.
2. **Security lands first** (after hygiene). Every later phase touches the query layer;
   building features on the old god-mode client and then re-plumbing them would double work.
3. **RLS enforces tenancy + coarse role gates; the app enforces fine-grained visibility —
   centralized.** RLS policies stay simple and testable. All intra-firm visibility decisions
   (`visibility_scope`, participants, staff assignment scoping) move into one authorization
   module that every server action calls.
4. **The "hardcoded staff visibility" pattern is fixed as a pattern**, not per feature:
   every creation path that pins `visibility_scope: "staff"` gets an explicit, audited
   visibility decision (UI control or deliberate default).
5. **Dead code is deleted, not restored.** The unused `src/modules/*` service layers
   (families, students, colleges, applications, essays, tasks, meetings, notes, documents,
   messages, billing, assignments) reference nonexistent columns and mislead maintenance.
   The live architecture is `src/lib/db/queries.ts` + `src/lib/actions/*` (+ the three
   genuinely used modules: `permissions`, `reports`, `workflows`).

---

## 3. Phase 0 — Hygiene & test harness (prerequisite, ~1–2 days)

| # | Item | Details |
|---|------|---------|
| 0.1 | Delete dead module scaffolding | Remove unused `src/modules/{families,students,colleges,applications,essays,tasks,meetings,notes,documents,messages,billing,assignments}`. Keep `permissions`, `reports`, `workflows`. Verify with import grep; type-check must pass. |
| 0.2 | Test infrastructure | Add Vitest (unit/integration) + Playwright (E2E; Chromium is preinstalled in CI image). Add `test` scripts to `web/package.json`. |
| 0.3 | Local Supabase in CI | Use `supabase start` (CLI) in CI to run migrations + seed against a disposable Postgres. This is the substrate for RLS/isolation tests in Phase 1. |
| 0.4 | CI pipeline | GitHub Actions: lint, type-check, unit tests, migration apply, isolation tests, golden-path E2E (grown incrementally per phase). |
| 0.5 | Seed fixtures for tests | Two firms; each with owner, counselor, one family (2 parents), one student; cross-firm fixtures power every isolation assertion. |

**Exit criteria:** CI green on an empty test suite scaffold; dead modules gone; type-check clean.

---

## 4. Phase 1 — Security foundation (~5–8 days)

### Findings being fixed

- `public.firm_id()` is a stub reading a never-set session variable
  (`supabase/migrations/00001_initial_schema.sql:14–25`) → all RLS policies are decorative.
- Every query uses the service-role client, bypassing RLS
  (`src/lib/db/client.ts:7–24`; sole client used by `queries.ts` and `queue/functions.ts`).
- Known authorization holes (all check firm only, or nothing):
  - `getDocumentDownloadUrl` ignores `visibility_scope` (`src/lib/actions/documents.ts:94–99`)
  - `getConversationMessages` ignores participation (`src/lib/db/queries.ts:1877`)
  - `sendMessage` verifies nothing — inserts into any conversation (`src/lib/actions/messages.ts:79–87`)
  - `updateTaskStatus` checks firm only — any portal user can flip any task (`src/lib/actions/tasks.ts`)
- `getStaffForSelect` filters status but not role, leaking student accounts into staff
  dropdowns (`src/lib/db/queries.ts:1742`).
- `document_access_logs` records uploads only; downloads never logged.

### Work items

| # | Item | Details |
|---|------|---------|
| 1.1 | Clerk ↔ Supabase third-party auth | Configure Supabase to accept Clerk JWTs. New `createUserClient()` in `src/lib/db/client.ts` that passes the Clerk session token (`accessToken` option). The stub's session-variable approach does not work through supabase-js/PostgREST — the Clerk-token route replaces it. |
| 1.2 | Real `public.firm_id()` | Migration: rewrite as a `STABLE SECURITY DEFINER` lookup — Clerk `sub` from `auth.jwt()` → `users.auth_provider_user_id` → active `firm_memberships.firm_id`. Companion helpers `public.current_user_id()`, `public.current_role()`. |
| 1.3 | Policy review pass | Audit every table's policy: confirm `WITH CHECK` semantics on writes; add coarse role gates where cheap (e.g., portal roles get SELECT-only on staff-managed tables). Keep policies simple — tenancy + coarse role, nothing more. |
| 1.4 | Convert user-driven paths to the user client | Thread the client through `queries.ts`/actions (context param or per-request factory). **Service-role allowlist** (documented in code): Clerk webhook, Inngest jobs, invitation claiming/auto-provisioning (`resolve.ts`), Scorecard sync. Everything else runs as the user. |
| 1.5 | Central authorization module | `src/lib/auth/authorize.ts`: `requireStudentAccess`, `requireFamilyAccess`, `requireDocumentAccess` (visibility-aware), `requireConversationParticipant`, `requireTaskActor`, `requireStaff`. Every server action calls these. Fixes the four holes above in one shape. |
| 1.6 | Storage hardening | Document downloads route through `requireDocumentAccess`; log downloads to `document_access_logs`. Add Supabase Storage policies scoping the `documents` bucket path (`{firmId}/…`) so raw storage access can't bypass table rules. |
| 1.7 | Fix `getStaffForSelect` | Filter to staff roles; removes students from attendee/assignee dropdowns. |
| 1.8 | Isolation test suite | SQL-level: with firm-A JWT claims, `SELECT` on firm-B rows returns zero across all tenant tables. App-level: parent cannot fetch staff documents/conversations by UUID; student cannot mutate others' tasks; deliberately-unfiltered query returns nothing cross-firm (proves RLS bites). |

**Exit criteria:** all user-driven traffic runs under user-scoped clients; isolation suite
green; the four named holes have failing-before/passing-after tests; service-role usage
is enumerable by grep and matches the documented allowlist.

---

## 5. Phase 2 — Onboarding & identity (~3–4 days)

### Findings being fixed

- **No parent invitation exists.** `addFamilyMember` creates dead-end `pending_` placeholders
  (`src/lib/actions/families.ts:124`); claim paths only match `invited_` prefixes
  (`api/webhooks/clerk/route.ts:80`, `src/lib/auth/resolve.ts:110,127`); nothing ever creates
  a `parent_guardian` membership; an invited parent would be auto-provisioned as **owner of a
  new empty firm** (`resolve.ts:186–226`). The finished family portal is unreachable.
- Student invites gated on `manage_staff` → plain `counselor` cannot invite own students
  (`portal-invite-card.tsx`; `modules/permissions/service.ts:32–53`).
- Invitation stuck-pending bug: if the Clerk webhook claims the placeholder first, the
  `student_invitations` row never flips to `accepted` (`resolve.ts:143–151` is the only writer).
- "Student Email" on create is silently discarded when no matching user exists
  (`src/lib/actions/students.ts:51–64`).

### Work items

| # | Item | Details |
|---|------|---------|
| 2.1 | Parent portal invitations | Mirror the student invite flow for family members: `invited_` placeholder, pre-staged `firm_memberships(role='parent_guardian')`, Clerk invitation with metadata, `family_invitations` table (or generalize `student_invitations` → `portal_invitations` with a `kind`), Resend email, resend/revoke, status card on the family page. Unify placeholder prefixes (`pending_` → `invited_`) with a data migration. |
| 2.2 | Claim path for parents | Extend webhook + `resolveUserAndFirm` claim logic to parent invitations; **remove or gate firm auto-provisioning** so an invited user can never be provisioned as a new firm owner (auto-provision only when explicitly signing up as a new firm). |
| 2.3 | Counselor invite permission | New permission (e.g., `manage_clients`) granted to `counselor` for **assigned** students/families; invite UI gates on it instead of `manage_staff`. |
| 2.4 | Invitation acceptance consistency | Webhook claim path also marks the invitation `accepted`; reconcile on `resolveUserAndFirm` as backstop. |
| 2.5 | Student email fix | Either drop the field from create (invite modal already takes an email) or persist it as the prefilled invite target. No silent discard. |

**Exit criteria:** golden-path steps 1–2 pass E2E — counselor-role user onboards student +
two parents to their portals with zero manual DB intervention.

---

## 6. Phase 3 — Collaboration & visibility (~5–7 days)

The systemic fix for "hardcoded staff visibility," feature by feature.

### Findings being fixed

- Messaging broken end-to-end: `createConversation` hardcodes `visibility_scope:"staff"`
  (`src/lib/actions/messages.ts:32`); portal queries filter for family/student scopes →
  portal inboxes permanently empty. Participants limited to one staff member. No
  notifications, no refresh.
- `createTask` hardcodes staff visibility (`src/lib/actions/tasks.ts:28`) → counselors cannot
  assign portal-visible tasks outside workflows.
- Meetings: attendee picker is staff-only and single-select (`calendar-client.tsx:150–155`);
  edit modal silently unlinks student / nulls end time (`calendar-client.tsx:272–277`,
  `meetings.ts:109`); `summary` fetched but never rendered/editable; delete has no confirm.
- Notes: no creation UI for student/family notes anywhere; college research notes unreachable
  (blocked behind the Phase-4 fit bug); visibility column unused.
- Documents: portals download-only; no way for a family to submit a transcript.

### Work items

| # | Item | Details |
|---|------|---------|
| 3.1 | Conversations with clients | `createConversation` accepts participants (staff + student + parents from the student's family) and derives `visibility_scope` from participant roles. Portal "New conversation" for students/parents (to their counselor). Participant checks via `requireConversationParticipant` (Phase 1). Unread state via `message_reads`. |
| 3.2 | Message notifications + refresh | Emit `message/created` → Inngest sends Resend notification to offline participants (respecting visibility). Lightweight polling or Supabase Realtime on open threads. |
| 3.3 | Task visibility control | Create-task modal gains audience control (staff-only / student / family) and student/parent assignees where sensible; portal task creation for students (own tasks). `requireTaskActor` guards mutations. |
| 3.4 | Meetings with client attendees | Multi-select attendees across staff + the student + family members (schema already supports via `meeting_attendees.user_id`). Fix edit-modal default-value bugs (student link, end time). Render + edit `summary` (post-meeting notes). Delete confirmation. Portal meeting views show attendees. |
| 3.5 | General notes | "Add note" on student and family pages with visibility choice (staff-only vs shared); notes list with edit/archive. (College research notes become reachable again via Phase 4.) |
| 3.6 | Portal document upload | Students and parents can upload to their own student/family scope (category picker; same processing job). Counselor "request a document" = family-visible task with `task_type='document_request'` linking category — no new table needed for golden path. |

**Exit criteria:** golden-path steps 4–7 pass; grep for `visibility_scope: "staff"` finds
only deliberate, commented defaults.

---

## 7. Phase 4 — Profile, intake & personalization (~3–4 days)

### Findings being fixed

- Recommendation scorer and fit analysis read columns that don't exist on `student_profiles`
  (`sat_score`, `act_score`, `geographic_preferences`, `financial_aid_needed`,
  `target_school_type`) → recommendations silently de-personalized; fit analysis always
  empty (`queries.ts:1289–1407`, `1468–1587`); empty fit hides the research-note buttons.
- No write path for `testing_summary_json`, `activities_json`, `awards_json`,
  `citizenship_status`, `budget_range`, `financial_aid_interest` (action accepts some;
  form renders none). Student portal profile is read-only. No intake feature.
- "AI-powered" label on rule-based recommendations (`recommend-client.tsx:62`).

### Work items

| # | Item | Details |
|---|------|---------|
| 4.1 | Profile schema migration | Add the five columns the scorer expects (`sat_score int`, `act_score int`, `geographic_preferences jsonb`, `financial_aid_needed boolean`, `target_school_type text`) to `student_profiles`. Keep `testing_summary_json` for score history/detail. |
| 4.2 | Counselor profile editor | Full profile form on the student page: academics (existing), testing (scores + history), preferences (geography, school type, budget, aid), citizenship, activities/awards editors backed by the JSON columns. |
| 4.3 | Student/parent intake | Portal intake form (student fills academics/activities/testing; parent fills budget/aid/citizenship) writing to the same profile with staff review — the "onboarding questionnaire" step of the service. Counselor sees completion status. |
| 4.4 | Un-break fit & recommendations | With real columns, `getCollegeFitAnalysis` and `getCollegeRecommendations` work as written; fix the label ("Profile-based suggestions"), add GPA to the scorer, and surface "add to list" directly from Recommend/Discover rows (removes the navigation dead-end). |
| 4.5 | List balance nudge | Per-category counts + reach/target/safety balance indicator on the counselor list page (portals already group by category). |

**Exit criteria:** golden-path steps 3 and 8 pass; two students with different profiles get
different recommendations in tests; fit chips render.

---

## 8. Phase 5 — Application season completeness (~5–7 days)

### Findings being fixed

- **Decisions cannot be recorded**: `updateApplicationDecision` fully implemented, zero call
  sites (`src/lib/actions/applications.ts:116–147`); decision badges and the Decision
  Outcomes report permanently empty; `student_colleges.decision_result`/`deposit_status`
  never written.
- No application detail page; `deadline_at` set once at creation, never editable.
- `checklist_json` has zero usage — no per-application requirements tracking.
- `application_type` enum mismatch: `/applications/new` writes long codes, list-derived
  creation writes short codes (`applications.ts:200`); deadline anchors match only short
  codes (`workflows.ts:554,618`); kanban labels only long codes.
- Essays: default staff visibility with no control → students can never see or edit;
  no essay↔college/application link (`essays.ts:34` reads a field the modal never sends);
  no counselor↔student loop.
- LORs: workflow steps only; no recommender tracking entity.

### Work items

| # | Item | Details |
|---|------|---------|
| 5.1 | Normalize `application_type` | Migration to short codes (`ea/ed/ed2/rea/rd/rolling`) + one shared label map; both creation paths write the same enum; anchors and labels work for all apps. |
| 5.2 | Application detail page | `/applications/[id]`: editable deadline & type, stage history, linked essays, checklist (5.3), decision panel (5.4), link back to college + supplement workflow. |
| 5.3 | Requirements checklist | Use `checklist_json` with a per-round default template (transcript sent, test scores, LORs, fee, supplements, interview, FAFSA/CSS where flagged); check-off UI on the detail page; completion % on kanban cards; feeds submission-QA step. |
| 5.4 | Decision recording | Decision modal (result + date, waitlist/deferral variants) wiring the existing `updateApplicationDecision`; sync `student_colleges.decision_result`/`deposit_status`; portals + Decision Outcomes report populate. Waitlist/deferral spawns an optional follow-up task (LOCI) — lightweight, not a full pipeline. |
| 5.5 | Essay sharing & student editing | Visibility control on essays (default: shared with student); student portal editor (reuse editor component; textarea is fine for golden path) with save-creates-version; status loop (`in_review` → `revision_requested` → `approved`) as the counselor↔student feedback channel; coach review stays staff-only. |
| 5.6 | Essay↔college linking | Wire `student_college_id`/`application_id` on create/edit (modal select); essays listed on the application detail page and the supplement workflow instance. |
| 5.7 | Recommender tracking (light) | `recommenders` table (name, role, per-college status: identified/asked/accepted/submitted) surfaced on the student page; complements the existing Recommendation Letters workflow template. |

**Exit criteria:** golden-path steps 9–11 pass; an application can go create → checklist →
submit → decision entirely in-app, and the cycle is visible to the family.

---

## 9. Phase 6 — Automation, reporting & close-out (~3–5 days)

### Findings being fixed

- Only three emails ever fire (student invite, staff invite, workflow-step digest);
  `enqueueJob` has zero callers; application-deadline reminders, daily digest, and message
  notifications are handlers with no producer (`src/lib/queue/index.ts:27,50`,
  `functions.ts:55–72`).
- Workflow instances never leave `not_started`; no step-completion UI besides tasks; no
  instance detail page.
- Dashboard "Recent Activity" is dead (`createAuditEvent` has zero callers;
  `refreshReportsJob` inserts with wrong column names, `functions.ts:239–245`).
- Reports page has a stale stage color map; computed-but-unrendered stats; no family-facing
  progress view.

### Work items

| # | Item | Details |
|---|------|---------|
| 6.1 | Application deadline reminder cron | Clone the working workflow-digest pattern (`functions.ts:406–491`) for `applications.deadline_at` (7-day and 48-hour notices to assigned staff; optional family notice). Delete the orphaned `enqueueJob` bridge or wire it — no dead producers. |
| 6.2 | Workflow lifecycle polish | Set `in_progress` on first step activity, `completed` when all steps terminal (extend the nightly sweep); add step complete/skip buttons (wire the existing unused `setStudentWorkflowStepStatus`); minimal instance detail view. |
| 6.3 | Audit events that exist | Call `createAuditEvent` from the central authorization/mutation helpers for key actions (invites, decisions, document access, visibility changes); fix or delete the broken `refreshReportsJob` insert. Dashboard Recent Activity renders real events. |
| 6.4 | Family progress view | Family dashboard gains a per-child progress section: workflow progress, application stages + checklist %, upcoming deadlines/meetings — the "where does my $20K stand" screen. Printable/exportable version is a follow-on, not golden path. |
| 6.5 | Reports cleanup | Fix stale stage colors; render the already-computed per-counselor caseload; Decision Outcomes now live via 5.4. |

**Exit criteria:** golden-path step 12 (full E2E) green in CI; no registered job without a
producer; no rendered panel without a writer.

---

## 10. Sequencing & dependencies

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 5 ──► Phase 6
   (CI)      (security)  (identity)  (collab)     (apps/essays)
                              └────► Phase 4 (profile/intake — parallel with 3)
```

- Phase 1 before everything: later phases add/modify queries; they should be written once,
  against user-scoped clients and the authz module.
- Phase 4 is independent of Phase 3 and can run in parallel with it.
- The E2E golden-path spec grows with each phase and becomes the regression gate.

**Rough total: 25–37 engineer-days** (5–7.5 weeks solo; ~3–4 weeks with two engineers, given
the Phase 3/4 parallel track).

## 11. Explicitly deferred (post-golden-path backlog)

- Essay prompt bank per college; rich-text editor; inline commenting on essay spans
- Interview prep/tracking; campus visit & demonstrated-interest tracking; scattergrams /
  historical outcomes database
- Client-engagement billing (contracts, retainers, invoicing families) — the existing
  billing schema is platform-SaaS billing and stays dormant
- External calendar (ICS/Google) sync; meeting reminder emails
- Printable/exportable family progress reports; weekly family digest email
- Firm settings depth (`enabled_modules_json`, `communication_preferences_json`, default
  workflow auto-assignment on intake)
- Dedicated document-request entity (golden path uses tasks)
