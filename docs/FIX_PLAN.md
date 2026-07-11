# CounselWorks Fix Plan — Golden Path + Security Remediation

**Status:** Phases 0–6 complete; Phases 7–10 planned (July 2026 second-pass audit,
see below). Phase 0: dead modules removed;
ESLint/Vitest/Playwright + CI with migration verification and two-firm fixtures.
Phase 1: RLS foundation (migration 00016), user-scoped client behind
`SUPABASE_USER_SCOPED_DB` (rollout steps in `docs/SECURITY.md`), central
authorization module wired into documents/messages/tasks, staff dropdown role
filter, download access logging, and the SQL isolation suite in CI. Phase 2:
family-portal invitations end-to-end (migration 00017, sendParentInvite +
resend/revoke, per-member controls on the family page), placeholder-prefix
unification, both claim paths mark invitations accepted, auto-provisioning
gated so invitees can never become new firm owners, `manage_clients` permission
lets plain counselors invite their own clients, and the silent student-email
discard is removed. Phase 3: participant-based conversations with derived
visibility (clients reachable at last), portal-initiated threads, message read
tracking + unread badges + polling, new-message email notifications (Inngest),
task visibility controls + document-request type + student personal tasks,
meetings with client attendees (edit-safe defaults, summaries, delete confirm,
attendees in portals), general student/family notes with staff/family
visibility + portal "notes from your counselor" cards, and portal document
upload (migration 00018). Phase 4: migration 00019 adds the five profile
columns the scorer/fit analysis always expected (unbreaking recommendations,
fit chips, and the research-notes UI) plus intake tracking and portal
self-update RLS policies; counselor Profile & Preferences editor with
test/activity/award record editors; student portal intake and parent family
intake with completion status; the scorer extracted pure and unit-tested
(different profiles → different rankings); honest "profile-based" labeling;
add-to-list from Discover/Recommend; and a list balance nudge. GPA was
deliberately NOT added to the scorer: the catalog has no admitted-GPA data to
compare against. Phase 5: migration 00020 normalizes application_type to the
short round codes with a CHECK constraint (shared enum module), adds the
recommenders table, and opens student editing of shared essay drafts at the
RLS layer; /applications/[id] detail page with editable deadline/round,
seeded requirements checklist (aid/round aware) with completion on kanban
cards, and a decision modal that syncs the college-list row, records deposit
status, populates the decision reports, and optionally spawns a LOCI
follow-up task; essays default to student-visible with sharing controls,
college linking (auto-linking the matching application), a student portal
editor with save-as-version and a submit-for-review loop (drafts lock at
approved/final); recommender tracking card on the student page. Golden-path
E2E steps 1–11 and 12 are feature-complete but stay `fixme` pending Clerk
test-auth plumbing (a Clerk dev instance + E2E_BASE_URL in CI). Phase 6:
application-deadline reminder cron (daily digest to each student's counselor,
7-day window); all orphaned automation deleted (generic email/invitation/
deadline/digest jobs, the enqueueJob bridge, the broken refreshReportsJob and
its producers, and the never-triggered bulk-sync event handler) — every
registered Inngest function now has a producer or a cron; workflow lifecycle
sync (not_started → in_progress → completed) wired into every step change and
the nightly sweep; staff step complete/skip controls on the student page; real
audit events (invites, applications, decisions, documents, meetings, workflow
application) feeding the dashboard's Recent Activity panel plus a caseload-by-
counselor panel rendering previously computed-and-dropped data; family
dashboard "Progress by Student" section (applications with stage/checklist/
deadline + workflow progress bars); reports stage colors fixed to the stages
the kanban actually writes. **Remaining work: Phases 7–10 (§10–13)**, produced
by a July 2026 second-pass audit that re-walked the golden path as a counselor
(six parallel reviews: shell/home, client management, college planning +
applications, essays/tasks/workflows/calendar, messaging/documents/reports,
and a design-system pass). The former deferred backlog is redistributed into
Phase 10; §15 holds what remains deferred. Clerk test-auth plumbing to flip
the golden-path E2E suite live is now work item 7.10.
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

1. An **owner/admin** creates the family and a 10th-grade student as bare records — no
   onboarding done, no contracts signed, no portal invites — and **assigns a counselor**.
   Assignment is deliberately owner/admin-only (it requires seeing the full client
   roster); the counselor's golden path begins the moment the assignment lands. The
   **counselor** (role `counselor`, not owner/admin) signs in, sees only their assigned
   clients, adds two parents to the household, and performs every following step.
2. Counselor sends portal invitations to the **student and both parents**; all three accept
   and land in the correct portals (student portal / family portal). No manual DB steps.
   (Phase 10 extends this step with a two-party service-agreement e-signature before
   portal access — see 10.1.)
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

## 10. Phase 7 — Defect burn-down & live regression gate (~3–4 days)

Point defects found by the second-pass audit. Everything here is a bug or a violation of
the Definition of Done — fix before building anything new.

### Findings being fixed

- **The intake handoff is half-defined.** Staff assignment gates on `manage_staff`
  (`students/[id]/page.tsx:56`, `lib/actions/assignments.ts:24–42`), which only owner/admin
  hold (`modules/permissions/service.ts:33–55`). **Decision (July 2026): this is
  deliberate** — assignment requires seeing the full client roster, so it stays
  owner/admin-only, and the golden path is redefined to start from a bare assignment
  (scenario step 1). The residual defect: a plain counselor holds `manage_clients` and can
  *create* a family/student they can never assign — the new record immediately vanishes
  from their scoped roster (`getAssignedStudentIds`), a silent dead-end.
- Meeting times are parsed in the server's timezone: `parseSchedule` builds
  `new Date(date + "T" + time)` server-side (`lib/actions/meetings.ts:20`) — a counselor
  entering 2:00 PM sees a different hour after render.
- `updateMeeting` deletes and re-inserts all non-creator attendees as `pending`
  (`meetings.ts:194–207`), wiping RSVP state, and silently re-derives `visibility_scope`
  from the new attendee set — an edit can flip a family-visible meeting to staff-only.
- Student status enum has two spellings: list filter/badges use `paused`
  (`students-client.tsx:24–29`), the edit form writes `inactive`
  (`edit-student-form.tsx:32–37`) — an "inactive" student vanishes from the Paused filter
  and renders an unknown gray badge. (Rule-4 violation.)
- `archiveFamily`/`archiveStudent` are fully implemented with zero callers
  (`families.ts:161`, `students.ts:153`); the edit form's `status="archived"` doesn't set
  `archived_at`, so "archived" students stay in the roster. (Rule-1 violation.)
- `updateApplicationStage` accepts any string, and the kanban dropdown can set
  "decision received" without a decision (`applications.ts:134–174`) — desyncs from the
  Record Decision flow and `student_colleges`.
- The same essay status renders different colors to staff and student — three hand-copied
  badge maps (`essays-client.tsx:35`, `essay-editor-client.tsx:77`,
  `portal-essay-editor.tsx:34`); the two editors also enforce different word limits
  (`word_count_target` vs `word_count_limit ?? target`, `essay-editor-client.tsx:234` vs
  `portal-essay-editor.tsx:75`).
- `addFamilyMember` never demotes an existing primary contact (`families.ts:144–150`) —
  multiple "Primary" badges possible (contrast `assignments.ts:77–85`, which demotes).
- Add-to-list category select silently defaults to "Safety" (first option, no placeholder
  — `components/colleges/add-to-list-button.tsx:106`), so recommended reaches get filed
  as safeties. (Rule-3 in spirit: an implicit default where an explicit decision belongs.)
- Meeting tables labeled "Date & Time" render date only (`students/[id]/page.tsx:398,418`,
  `families/[id]/page.tsx:242`).
- Essay editors have no `beforeunload` guard (staff computes `hasUnsaved` but never blocks
  navigation; the portal editor doesn't track unsaved state at all) — closing the tab
  silently drops work.

### Work items

| # | Item | Details |
|---|------|---------|
| 7.1 | Intake handoff alignment | Assignment stays owner/admin-only (`manage_staff`) — documented as deliberate. Family/student *creation* becomes an owner/admin intake action to match (create + assign is one handoff); creation UI hides for plain counselors. `manage_clients` continues to cover managing and inviting **already-assigned** clients. Golden-path E2E step 1 rewritten to the bare-assignment start. |
| 7.2 | Meeting timezone correctness | Build the ISO timestamp client-side (hidden field from the browser) or submit the UTC offset with the form; `parseSchedule` stops guessing. Unit-test the conversion. |
| 7.3 | Meeting edit preserves state | Diff the attendee list — keep RSVP rows for unchanged attendees; show the derived audience in the modal before save so a visibility flip is never silent. |
| 7.4 | Student status single source | `src/lib/constants/students.ts` with one vocabulary (`active/paused/graduated/archived`); data migration remaps `inactive` → `paused`; every filter, form, and badge imports the shared map. |
| 7.5 | Archive wiring | Archive/unarchive get UI (family + student edit forms) and set `archived_at`; the misleading `status="archived"` option either sets it too or is removed. |
| 7.6 | Application stage guardrails | Validate stage against the shared enum; remove "decision received" from the kanban dropdown — the decision modal is the only writer of that state. |
| 7.7 | Shared essay status map | One constants map (labels + badge variants) imported by the staff list, staff editor, and portal editor; one word-limit resolution rule used by both editors. |
| 7.8 | Single primary contact | Demote the existing primary when adding/marking a new one (mirror `assignments.ts:77–85`); allow changing primary from the family page. |
| 7.9 | Small-defect batch | `formatDateTime` on meeting tables; add-to-list category gets a required placeholder (no silent Safety); `beforeunload` unsaved guard on both essay editors. |
| 7.10 | Flip the golden-path E2E live | Clerk test-auth plumbing (dev-instance test users + `E2E_BASE_URL` in CI); remove all 12 `fixme`s. This is the regression gate for Phases 8–10 — land it first or in parallel. |

**Exit criteria:** every defect above has a failing-before/passing-after test where
testable; golden-path E2E runs green in CI with no `fixme` left; enum grep finds one
spelling per domain.

---

## 11. Phase 8 — Daily-driver UX (~5–7 days)

The gap between "wired" and "worked from": the shell must pull the counselor toward
waiting work, and every list must survive 10–15 students × a full application season.

### Findings being fixed

- No loading/error affordances anywhere: zero `loading.tsx`/`error.tsx`/`not-found.tsx`,
  no skeletons/Suspense — every navigation freezes until data resolves; a thrown query
  shows the raw framework error page.
- Nothing signals waiting work: no unread badge on Messages nav (`layout/sidebar.tsx:22`),
  stat cards aren't links (`cards/stat-card.tsx`), Recent Activity rows don't link,
  "Due Today"/"Overdue" are bare counts with no agenda list, no global search in the shell.
- Lists don't scale: no pagination or sorting anywhere (`tables/data-table.tsx:38–51`;
  `getStudents`/`getFamilies` fetch the whole firm); list searches fire un-debounced
  `router.push` per keystroke (families/students/documents).
- Applications board has no student/round/due filter (`applications-client.tsx:102–119`);
  "View application" from the college list dumps to the unfiltered board instead of the
  record (`student-college-list-client.tsx:1333–1337`); decisions never appear on the
  student's own college list.
- `createApplicationFromList` yields deadline-less applications (`applications.ts:425–439`);
  no round→deadline anchoring exists — 100+ hand-typed dates per season at caseload scale.
- Checklist toggles are one blocking server round-trip each
  (`application-detail-client.tsx:123–128`).
- Client-lifecycle dead-ends: family members can't be edited or removed; active portal
  accounts can't be deactivated (`member-portal-actions.tsx:44–46`); no "Add student" on
  the family page; the student page doesn't link back to its family
  (`students/[id]/page.tsx:343–350`).
- New-conversation modal: the Type selector is decorative (visibility actually derives
  from participants, `messages.ts:111–115`), and unclaimed members vanish from the picker
  with no explanation.
- Calendar "+N more" overflow is a dead span (`calendar-client.tsx:611–615`); the month
  grid is the only view.

### Work items

| # | Item | Details |
|---|------|---------|
| 8.1 | Route scaffolding | `loading.tsx` (skeletons), `error.tsx`, `not-found.tsx` for the dashboard and both portals; `Skeleton` primitive (Phase 9 reuses it). |
| 8.2 | Waiting-work signals | Unread-message badge on the nav in all three shells; stat cards deep-link to pre-filtered views; Recent Activity rows link to their entities. |
| 8.3 | Today agenda | Dashboard "Today" panel: due/overdue tasks, meetings, and application deadlines as actionable linked lists — the morning screen, replacing bare counts. |
| 8.4 | Global quick-find | Header search (cmd-K) across students and families to start; jump to any record from anywhere. |
| 8.5 | Table foundations | `DataTable` grows sorting + pagination + numeric alignment; adopt on students/families/documents/essays/tasks; a shared debounced-search hook replaces per-keystroke navigation. |
| 8.6 | Applications board at scale | Student / round / due-soon filters + sort; college-list rows deep-link to `/applications/[id]`; board "Add Application" can pre-fill from a college-list entry. |
| 8.7 | Round→deadline anchoring | Default deadline per round (firm-level defaults now; per-college catalog dates later); `createApplicationFromList` and `/applications/new` auto-populate `deadline_at` (editable). |
| 8.8 | Decisions visible | Decision-result badges on the per-student college list (data already loaded); the stage badge stops masking the outcome. |
| 8.9 | Client lifecycle controls | Edit/remove family members; deactivate a portal account (membership revoke + audit event); "Add student" on the family page (household pre-linked); student→family backlink. |
| 8.10 | Interaction cost | Optimistic checklist toggles (batched write); new-conversation modal drops the decorative Type field, makes the audience preview prominent, and explains uninvited members ("invite to portal to message"). |
| 8.11 | Calendar quick wins | Agenda (list) view alongside the month grid; "+N more" opens the day's meetings. Full week/day views are Phase 10. |

**Exit criteria:** the counselor's day loop (open app → see agenda + unread → act) has no
dead ends; all lists paginate and sort; the golden-path E2E spec extends to board filters
and decision badges.

---

## 12. Phase 9 — Design system, brand & responsive shell (~5–7 days)

From the design audit: the primitive layer exists and is ~60% adopted; the gap is feedback
primitives, token completeness, brand identity, and a responsive shell. Mostly mechanical
and parallelizable with Phase 8 once 8.1 lands.

### Findings being fixed

- No brand identity: stock Tailwind blue as `primary`, default system font, no favicon,
  no logo asset, bare Clerk auth pages; firm branding (`branding_logo_url`, primary color)
  is configurable in Settings but never rendered in any shell.
- Feedback is native-browser: 10 `confirm()` + 3 `alert()` call sites; no toast; the same
  red error banner copy-pasted 37 times across 28 files; two competing button-pending
  idioms (spinner vs "Saving…" text swap).
- Tokens bypassed: 111 raw `red/green/blue/…` usages across 35 files; three competing
  status-color systems (kanban columns vs reports dots vs calendar chips); `success/
  warning/danger` scales define only 3 stops, which is what forces the raw colors.
- Mobile hard-broken: all four layouts hardcode `fixed w-64` + `ml-64` with no responsive
  handling — and parents open portal invites on phones.
- 29 duplicated inline SVG icons across the three sidebar files; text glyphs (`✕`, `⚠`)
  used as icons; 22 unstyled native checkbox/radio/date inputs; ~8 hand-rolled tables
  beside `DataTable`; `rounded-md`/`rounded-lg` and `gray-500`/`gray-600` drift; two
  different StatCard implementations (home vs Reports).
- Accessibility: 7 aria-labels app-wide, missing focus rings on ad-hoc buttons,
  color-only status signaling.

### Work items

| # | Item | Details |
|---|------|---------|
| 9.1 | Brand pass | `next/font` typeface, a real brand hue for `primary`, favicon + logo assets, branded auth pages (logo + product frame around the Clerk widget), consistent landing → auth → app identity. |
| 9.2 | White-labeling renders | Firm `branding_logo_url` + primary color applied in the dashboard and portal shells (CSS-variable override) — the configured feature becomes visible. |
| 9.3 | Feedback primitives | `Alert` (replaces the 37 banners), `Toast` (mutation feedback), `ConfirmDialog` (replaces every `confirm()`/`alert()`). |
| 9.4 | Token completion & migration | Full `-50…-900` scales for `success/warning/danger`; migrate the 111 raw color usages; one status-color system shared by kanban, reports, and calendar. Consider a lint rule banning raw status colors. |
| 9.5 | Responsive shell | Collapsible sidebar + hamburger across all four layouts; portals verified at 375px width. |
| 9.6 | Icons & nav | One shared icon set (single `icons.tsx` or lucide-react); config-driven sidebar shared by the three shells; nav grouped (Clients / Admissions / Operations / Admin) so 14 flat items become scannable. |
| 9.7 | Form control kit | Styled `Checkbox`/`Radio`/`DatePicker`; `Button loading` becomes the one pending idiom; `FormField` required-marker convention everywhere. |
| 9.8 | Consistency sweep | Hand-rolled tables onto `DataTable`; radius and gray-tone normalization; one `StatCard`. |
| 9.9 | Accessibility pass | aria-labels on all icon-only buttons; `focus-visible` on ad-hoc buttons; text/icon redundancy wherever color encodes status. |

**Exit criteria:** zero native `confirm`/`alert`; zero raw status colors (grep clean);
the app is usable on a phone; automated a11y checks (axe) pass on golden-path pages.

---

## 13. Phase 10 — Elite-service features (~18–24 days, priority-ordered)

The features that justify a $15–25K engagement, ordered by fee-justifying value. The
former deferred backlog is folded in here (each item notes what it absorbs); what remains
deferred is §15. Items are independent — ship top-down, stop anywhere.

### Work items

| # | Item | Details |
|---|------|---------|
| 10.1 | Service agreement e-signature | Onboarding gains a two-party engagement-letter signature: firm-branded agreement template, sent to the family during onboarding, signed by **both** parties (firm signer + parent/guardian). Legitimacy is the requirement — ESIGN/UETA-grade evidence: consent to transact electronically, clear intent-to-sign action, document hash, signer identity/timestamp/IP audit trail, immutable signed PDF stored in Documents (family-visible) with copies emailed to both parties. Prefer a provider integration (e.g. Dropbox Sign / SignWell / Documenso API) for evidentiary strength over a home-rolled click-wrap; a firm setting can gate portal invitations on a signed agreement. Extends golden-path E2E step 2. *(un-defers "contracts" from the billing backlog line; retainers/invoicing stay deferred)* |
| 10.2 | Family progress report deliverable | Point-in-time printable/PDF per-student progress report (extends the Phase-6 family dashboard and the college-list print-route pattern); Reports page gains date-range/class-year/counselor scoping, CSV export, and a per-student decision-outcome roster ("where everyone stands"). *(absorbs backlog: printable/exportable family progress reports)* |
| 10.3 | Essay coaching loop | Counselor feedback visible in the portal (per-version comments), then inline comments anchored to text spans; per-college supplement prompt bank with bulk essay creation; autosave. Rich-text editor stays optional/last. *(absorbs backlog: prompt bank, inline commenting, rich-text editor)* |
| 10.4 | Notification system | Per-user notification preferences + firm defaults (`communication_preferences_json`); digest mode replacing the per-message email blast; meeting reminder emails; weekly family digest; in-app notification feed (bell) fed by the same events. *(absorbs backlog: meeting reminder emails, weekly family digest, part of firm-settings depth)* |
| 10.5 | Document lifecycle | First-class document requests (request → pending → fulfilled, with portal prompts + reminders — replaces the Phase-3 task-based stopgap); re-upload versioning (the dead `document_versions` path gets a writer + history UI); attachments on messages. *(absorbs backlog: dedicated document-request entity)* |
| 10.6 | Aid & testing | Scholarship/aid award tracking per application (amount, merit vs need) with net-cost comparison across acceptances; testing plan (planned SAT/ACT sittings + registration deadlines, building on `testing_summary_json`). |
| 10.7 | Calendar depth | Week/day views; read-only ICS feed per counselor (subscribe-only external calendar sync first). *(absorbs backlog: external calendar sync)* |
| 10.8 | Recommendation & automation depth | Reach/target/likely classification in the recommender (acceptance rate × student scores) with a cross-student list-balance report; default workflow auto-assignment on intake (firm setting); bulk operations (apply a workflow to a cohort, bulk task assignment). *(absorbs backlog: default workflow auto-assignment on intake)* |
| 10.9 | Engagement tracking (light) | Interview tracking and campus-visit/demonstrated-interest log on the student-college row — schema-light, optional. *(absorbs backlog: interview prep/tracking, campus visits & demonstrated interest)* |

**Exit criteria:** each item ships with the full Definition of Done (all three personas,
E2E extension, no half-wiring); 10.1–10.5 land before anything below them.

---

## 14. Sequencing & dependencies

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 5 ──► Phase 6     (complete)
   (CI)      (security)  (identity)  (collab)     (apps/essays)
                              └────► Phase 4 (profile/intake — parallel with 3)

Phase 7 ──► Phase 8 ──► Phase 10
(defects +      └────► Phase 9 (design system — parallel with 8 after 8.1)
 live E2E)
```

- Phase 1 before everything: later phases add/modify queries; they should be written once,
  against user-scoped clients and the authz module.
- Phase 4 is independent of Phase 3 and can run in parallel with it.
- Phase 7 first among the new work: it is small, removes known-wrong behavior, and flips
  the golden-path E2E live (7.10) so every later phase has a regression gate.
- Phase 9 parallels Phase 8 once 8.1 lands (shared `Skeleton` primitive); the two phases
  touch mostly disjoint files.
- Phase 10 items are independent and priority-ordered; ship top-down, stop anywhere.
- The E2E golden-path spec grows with each phase and remains the regression gate.

**Rough totals:** Phases 0–6: 25–37 engineer-days (complete). Phases 7–10: 31–42
engineer-days (~6–8.5 weeks solo; Phase 8/9 parallelize with two engineers).

## 15. Explicitly deferred (post-Phase-10 backlog)

The former backlog is distributed into Phase 10 (each item there notes what it absorbs).
Still deferred — genuinely out of scope until Phases 7–10 ship:

- Client-engagement **billing** (retainers, invoicing families, payment collection) — the
  existing billing schema is platform-SaaS billing and stays dormant. (The engagement
  *contract/e-signature* piece moved up into 10.1.)
- Scattergrams / historical outcomes database
- Meeting scheduling links / availability booking (families self-book a slot)
- Recurring tasks; CSV bulk import of families/students
- Real-time messaging transport (WebSocket/Supabase Realtime — polling stays until it hurts)
- `enabled_modules_json` firm module toggles
