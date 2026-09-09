# Workflow improvement implementation plan

Prepared September 8, 2026. Baseline reviewed: `cc7a584` on `main`.

## Objective

Make the college-application task journey continuous: a counselor assigns a clear responsibility; the student opens the task and does the work; the counselor reviews it when necessary; and both can see what happens next.

This plan builds on `docs/WORKFLOW_UX_REVIEW.md` and supplements `docs/FIX_PLAN.md`. It is not a rewrite of the application. Preserve the existing student workspace, essay editor/versioning/review, document storage, application checklists, workflow engine, recurring tasks, and notification infrastructure.

The baseline assessment was source-based. Local type-check, lint, and 206 unit tests passed, but all 19 golden-path E2E tests skipped because test credentials were absent. Reconfirm findings against the current checkout and live test environment; do not describe those skipped tests as a pass. Existing roadmap claims about production or CI are historical context, not proof of the current environment.

## Product decisions

- Ownership and visibility are independent. A student can see a counselor review step without being allowed to complete it.
- Each task has one responsible person. Review-required tasks also have an explicit reviewer. Parents may own work when selected; multiple parents must never be resolved arbitrarily.
- Ordinary to-dos retain a simple completion checkbox. Deliverables can require evidence and counselor approval.
- Every task can be opened from the dashboard, task list, and workflow plan. The same task retains the same identity across these surfaces.
- Students should understand what is theirs, what is waiting on another person, and what is next without learning workflow terminology.
- Reuse existing essay/document/application interfaces. A workflow must not create a second essay editor, document repository, or independent approval truth.
- Dates derived from an application remain linked to that application. Explicit counselor overrides survive automatic rescheduling.
- Preserve current records and permissions. Do not rely on the old roadmap's assumption that there are no production clients.

## Delivery sequence

Implement in the order below, with one reviewable change set per phase where practical. Each phase must include working read/write paths and tests for its behavior. Record completed work and remaining live-verification blockers in this document. Do not mark a phase complete merely because its schema or UI exists.

### Phase A — Correct ownership, authorization, and task accuracy

**Outcome:** “Assign to student” creates student-owned work, and each persona sees accurate, actionable information.

Work:

1. Add a shared resolver for task owners that accepts a student, an intended role/person, and the acting counselor. Resolve staff from that student's assignments and portal users from the existing student/family relationships. Validate firm membership and access centrally.
2. Use it for manual, individual-workflow, bulk-workflow, recurring, and onboarding/default-workflow creation paths. Search for all callers of workflow instantiation/materialization rather than fixing only the visible modal.
3. Replace the staff-only assignment dropdown with clearly labeled student, assigned staff, and eligible parent choices. Keep “Visible to” independent and explain the resulting audience before saving.
4. Handle missing portal access explicitly: allow a saved plan awaiting owner resolution, clearly mark it as not ready to publish, and offer the existing invitation flow. Do not silently assign student work to its creator or send an invitation automatically.
5. Restrict portal mutation to the actual owner and approved transitions. Keep staff permissions scoped to authorized students. Implement parent completion only for parent-owned, parent-visible tasks; parents may not approve counselor reviews.
6. Correct dashboard totals using count queries and consistent archive/visibility filters. Count college-list schools separately from applications. Distinguish a preview list from total task count.
7. Show save/completion failures in the UI. Validate statuses and transitions on the server.

Acceptance:

- A counselor creates a student task from the student workspace; student identity is preselected, ownership is correct, and the intended portal sees it.
- A counselor-owned review shared with the student is visible but cannot be completed by that student, including by direct server-action invocation.
- An unlinked student account produces a clear unresolved-owner state, not a misleading staff assignment.
- Selecting a parent requires an explicit eligible person; another parent cannot complete that person's task.
- Single, bulk, recurring, and default workflow paths apply the same ownership rules.
- With more than 10 tasks, archived tasks, and hidden staff tasks, dashboard totals still match the authorized task list.

Primary code: `web/src/lib/actions/{tasks,workflows,bulk,recurring-tasks}.ts`, `web/src/lib/auth/authorize.ts`, `web/src/lib/db/queries.ts`, `web/src/lib/workflows/tasks-sync.ts`, `web/src/modules/workflows/service.ts`, task creation UIs, student provisioning/default-workflow callers.

### Phase A implementation record — September 8, 2026

Status: implemented locally for review; **acceptance/release verification is still open**. Updated the checkout with `git pull --ff-only` on `codex/workflow-improvement-plan` (already current with its tracked remote). No deployment, production migration, backfill, or test notification was performed.

Implemented:

- Shared `lib/auth/task-owner.ts` resolves linked students, assigned staff (unique primary preferred), and explicitly selected family parents. Checks active firm membership and the acting staff member's student access. Unlinked contacts retain unresolved intent; parent identity is never inferred from the family.
- Manual and recurring forms expose student, assigned staff, and named parent choices independently of audience. Student-workspace creation defaults to student ownership and student visibility. All workflow instantiation callers (individual, bulk, default provisioning/import) use the resolver in the service; workflow and recurring materializers revalidate ownership. Bulk student tasks and application-decision writing follow-ups use it too.
- Migration `00043_task_owner_intent.sql` adds task owner intent/pending state and recurring owner intent, preserving historical rows. Pending tasks are visibly unpublished in staff Tasks, excluded from portal task lists/counts, and protected by restrictive RLS policies. Staff can select/resolve an eligible owner and publish, or open the existing invitation flow. Workflow steps with unresolved owners carry no reminder recipient. A staff retry control recovers missing tasks after materialization failures.
- Task server actions require actual portal ownership plus student/family relationship and audience; another parent cannot complete the selected parent's work. Portal review approval and unsupported statuses/transitions are rejected. Staff task deletion and workflow mutations check student access. Archived/unresolved tasks cannot be completed. Task updates detect conflicting writes and clear completion timestamps on reopening.
- Student/family task totals use exact counts independent of preview limits and share archive, visibility, and pending-owner filters with lists. Schools count college-list rows rather than applications. Student application/meeting totals and counselor task totals use count queries. Task, recurring, and workflow mutation errors are surfaced.
- Read-only `supabase/tests/task-owner-legacy-report.sql` reports a specified firm's legacy student-linked tasks for explicit counselor review. It does not infer intent from visibility or change historical assignments/completion.

Automated verification: type-check and zero-warning lint passed; **220 unit tests passed across 25 files**, including owner resolution, direct server-action denials, parent identity, review/status transitions, and 15 authorized tasks alongside hidden/archived/unpublished records with a 10-row dashboard preview. Golden-path E2E was extended with workspace ownership and two-parent completion checks and updated to exercise the actual student-owned workflow step. The configured invocation discovered **20 tests and skipped all 20** because Clerk test credentials were absent; this is not a live pass.

Follow-up database verification: installed PostgreSQL 16 tooling and created a disposable database under `/private/tmp`, listening only on its local Unix socket. All migrations through 00043 applied successfully; seed data and isolation fixtures applied (fixtures twice to check repeatability); the full isolation suite passed. The default Homebrew post-install cluster setup failed, so the tests used a separately initialized temporary cluster. No system database service was enabled. Still required before Phase A acceptance: exercise counselor/student/both parents live, missing-access invitation → resolution → publication, bulk/default/recurring ownership, retries, mobile and keyboard interaction. Review the legacy dry-run report against an explicitly selected environment before any separately approved remediation. No legacy report was run against production. Migration numbering follows this repository's sequential convention; Supabase CLI generation/advisor checks could not run locally.

Phase C still owns atomic/idempotent workflow advancement, concurrent materialization protection, artifact review, and coherent prerequisite reopening. Phase D owns whole-plan preview/publishing, date provenance, and duplicate-plan handling. Those are not claimed complete by the new task-level pending-owner controls. **Phase B implementation is recorded below; live acceptance remains open for both phases.**

### Phase B — Make every task open into the work

**Outcome:** The student can navigate from “what is due” directly to the relevant work.

Work:

1. Implement a shared task detail component exposed through authorized staff/student/family routes. Use a stable task URL suitable for notifications; select route names to fit the existing application.
2. Display full instructions, owner, reviewer when applicable, due date, college/application, workflow context, status, and the next available action. Avoid truncating the only copy of instructions.
3. Add typed links to existing essays, documents/document requests, and application requirements. Audit existing schema relationships first; add only relationships needed to support the actual user flow.
4. Use explicit actions such as Open essay, Upload transcript, Open application checklist, and Mark complete. Honor existing resource visibility and editing permissions when resolving links.
5. Make dashboard rows, task-list rows, and workflow steps navigate to this detail view. For blocked steps without a materialized task, show step context and the prerequisite rather than generating an actionable task early.
6. Add “My work” and “Waiting on others” grouping. Explain blocked steps without exposing private counselor notes or hidden step titles. Show personal progress separately from overall plan progress.
7. Provide a contextual help action using existing messaging. Prefill task context, but require the user to send the message. Do not create a second conversation system.

Acceptance:

- From the dashboard, a student opens an essay task, reads the entire instructions, and reaches the correct essay without searching another module.
- Document requests open the correct upload flow and preserve task/student context.
- The same task opens consistently from My Tasks and My Workflows.
- Waiting states explain the responsible role and next event without exposing staff-only content.
- Keyboard and narrow-screen users can open tasks, read instructions, and operate the primary action without horizontal overflow or hover-only controls.

Primary code: student dashboard/tasks/workflows pages, `web/src/components/cards/workflow-progress.tsx`, staff task table and workflow list, `web/src/lib/db/queries.ts`, existing essay/document/application components and actions.

### Phase B implementation record — September 8, 2026 follow-up

Status: implemented locally; **live browser acceptance remains unverified**. Continued with independent implementation after closing Phase A's local database checks, as requested.

- One shared task detail component serves `/tasks/[id]`, `/student-tasks/[id]`, and `/family-tasks/[id]`. `/task/[id]` is a stable, authenticated, persona-routing URL. Fetch-by-ID checks current firm, student assignment/relationship, audience, archive, and unpublished state before returning content.
- Details display full instructions, responsible person, reviewer for review tasks, due date, priority, status, workflow and available college/application context, and the permitted next action. Dashboard/task-list/workflow links retain the same task identity. Staff can link/unlink existing work on task detail using a student-scoped picker.
- Typed links reuse `tasks.related_entity_type`, `related_entity_id`, and `application_id`; no Phase B schema addition or artifact repository. Resource access is checked separately: a shared task cannot reveal an inaccessible essay/document title or another student's work. Essays open the existing editor; documents use the existing authorized download action; requests reuse the existing upload component with request/student/task identity; application links target the exact application and render its existing checklist read-only in the portal.
- Upload validates the request and optional linked task **before** uploading a file. Closed, inaccessible, and mismatched requests fail visibly. This closes the pre-existing firm-only request-fulfilment check that the new navigation exposed. Existing document processing/notification machinery remains the producer/consumer path; no test notifications were sent.
- Student and family task lists distinguish My work and Waiting on others. Portal workflow progress distinguishes personal from overall progress. Blocked steps retain context without materializing tasks early, and hidden prerequisite titles/instructions are replaced by a generic waiting explanation. Pending-owner task links remain unavailable to portals.
- Ask about this task prefills the existing staff/student/family message composer with authorized task context and the stable URL. It never submits a message automatically. Header/detail text wraps for narrow viewports; navigation uses keyboard-operable links and buttons.

Verification: **type-check and zero-warning lint passed; 237 unit tests across 29 files passed**. New regression tests cover UUID access, shared counselor work, cross-firm/student denial, hidden resources, link writes and unlinking, application-context preservation, blocked-step privacy, personal progress, and request/task validation before uploads. Golden-path coverage now includes exact task detail, full instructions, keyboard/narrow viewport checks, unsent help prefill, existing essay-editor navigation, and task-linked request upload. The final E2E invocation discovered **21 tests and skipped all 21** because Clerk dev credentials are absent. No authenticated persona or browser-layout checks are claimed as passed.

Remaining acceptance blockers: configure a disposable app with Clerk development keys, rerun golden-path and inspect counselor/student/both-parent/mobile/keyboard flows; exercise unavailable resources and failed writes live. Local Postgres verifies migrations/RLS but is not a running Supabase Storage/PostgREST + Clerk app. Supabase CLI advisor generation was not run. No production project was changed and no legacy ownership backfill was run. Phase B needs no additional migration; the application's Phase A fields still require 00043 wherever the app is eventually deployed.

Next implementation phase: **Phase C — deliverables, review, and workflow advancement**. Its submission/approval truth, concurrency guarantees, atomic advancement, and prerequisite reopen policy are not implemented by Phase B. Phases D and E remain unstarted.

### PR and migration follow-up — September 8, 2026

[PR #40](https://github.com/studyworksprep/counselworks/pull/40) contains Phases A–B. After opening it, applied the exact `00043_task_owner_intent.sql` contents to CounselWorks (`bfgiiapopzexrrcpsmyh`) under the user's explicit follow-up authorization. Supabase recorded `20260908202359_task_owner_intent`. Verified the three columns, nullable owner roles, non-null/default-false pending flag, all three restrictive policies, and RLS on both tables. This supersedes the earlier pending-migration status for this project. No ownership backfill, app deployment, or PR merge was performed.

Security advisors before and after migration reported the same existing warnings: three functions with [mutable search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), four [anonymous-callable security-definer functions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), and four [authenticated-callable security-definer functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). These require separate review; this migration introduced no new advisor findings. Type-check, zero-warning lint, and all 237 unit tests passed again before the implementation commit. Live persona/E2E acceptance remains blocked on disposable app credentials.

### Phase C — Connect deliverables, review, and workflow advancement

**Outcome:** A task requiring review becomes complete only when its actual deliverable is approved.

Work:

1. Define completion modes in shared constants: simple completion, evidence submission, and review required. Map the user-facing lifecycle onto existing statuses where possible. Introduce additional persisted states only where necessary and update every reader/writer together.
2. Support these user-facing states: To do, In progress, Submitted for review, Changes requested, and Complete. Treat dependency blocking as a separate reason a task cannot yet be acted upon; do not use it as a substitute for review status.
3. For essays, connect to the existing draft/version and review lifecycle. A submission must identify the version being reviewed. Approving an old version must not approve a newer draft accidentally.
4. For document requests, attach the authorized uploaded document as evidence and support an explicit review decision when configured.
5. Add a counselor “Needs review” queue with access to the task, submitted artifact, and Approve/Request changes actions. Changes requested includes feedback and returns responsibility to the student.
6. Centralize task/step transitions. Only accepted completion activates downstream steps for review-required work. Simple checkboxes keep their fast path.
7. Provide Undo/Reopen. Reopening a prerequisite must not silently delete downstream work: reblock untouched dependent work, preserve started/submitted artifacts, and flag affected downstream work for counselor review. Update task and workflow progress together.
8. Make creation, submission, approval, activation, and retry behavior idempotent. Surface partial failures and provide a safe retry. Check the nightly activation job uses the same rules as interactive actions.

Acceptance:

- Student submits a draft → counselor sees it in Needs review → requests changes → student revises/resubmits → counselor approves → the linked step completes and the next step activates exactly once.
- A review-required task cannot be bypassed with the generic completion action.
- Uploading unrelated evidence or an inaccessible document cannot complete the task.
- Failed activation or a repeated approval does not create duplicate tasks or falsely report a fully completed operation.
- Reopening a completed task updates the workflow and preserves downstream artifacts according to the stated policy.
- Existing standalone essay review continues to work and cannot disagree with the linked task's accepted submission.

Primary code: task/essay/document actions, `web/src/lib/workflows/tasks-sync.ts`, `web/src/modules/workflows/service.ts`, `web/src/lib/queue/functions.ts`, counselor dashboard/student workspace.

### Phase C implementation record — September 8, 2026

Status: **implemented locally; live acceptance remains open**. Fetched merged PR #40 (`9019281`) and started `codex/workflow-phase-c` from current main. Migration 00044 is local only; no production migration, backfill, deployment, or test notification was performed in this phase.

- Completion requirements now distinguish simple checkboxes, evidence submission, and counselor approval. Staff configure a task after linking its essay or document request; template steps carry a completion requirement into generated tasks. Reviewers are eligible staff and can be reassigned without discarding an existing submission. Submitted tasks and requested changes remain visible in task lists and totals; workflow cards show the corresponding task lifecycle while dependency blocking stays separate.
- Essay submission freezes the actual working body in an existing version row. Saves and snapshots are transactional; edits or a newer saved version invalidate the old submission. Task and standalone essay review use the same transaction and displayed submission identity. Old-version approval, approval without resubmission after requested changes, wrong reviewers, and generic completion of evidence/review work fail visibly. One active deliverable task per essay prevents conflicting acceptance decisions; simple reference links can still be shared. Legacy approved essays without a recorded submission must be reopened and resubmitted for a new review decision rather than fabricating historical evidence.
- Document tasks use the exact authorized `fulfilled_document_id` from the linked request. Submission either accepts evidence or waits for its assigned reviewer. Requested changes require feedback and reopen the request while preserving earlier files. A replacement must be resubmitted; an old document approval cannot accept it. The selected parent can submit family-visible evidence; another parent cannot act for them.
- The counselor dashboard links to **Needs review** (`/tasks/review`), showing assigned submissions and accessible downstream work requiring attention. Task detail exposes the submitted essay snapshot or authorized document download, feedback, Approve/Request changes, Reopen, and Retry workflow. Shared observers cannot approve; parents cannot read private essay snapshots through a family-visible task.
- A task transition synchronizes its linked step, prerequisite activation, and overall progress in the same database transaction. Reopening reblocks untouched descendants; started work and submitted artifacts are retained and flagged for counselor attention, and a descendant's now-invalid completion is cleared. Staff explicitly reopen affected work. Linked steps use task transitions rather than a separate completion bypass; linked steps cannot be silently skipped/archived.
- Instance creation and step insertion are atomic. Step materialization locks the row through insert and link, so simultaneous retries cannot create orphan or duplicate tasks. Downstream task creation is separately retryable after the accepted transition; a failure reports that the decision was saved and points to Retry workflow. Interactive actions and the nightly sweep call the same reconciliation/materialization code and propagate failures. Duplicate whole-plan assignment policy remains Phase D.

Verification: type-check, zero-warning lint, and **242 unit tests across 30 files passed**. All migrations through 00044, seed data, fixtures applied twice, and the RLS isolation suite passed in a fresh disposable PostgreSQL 16 database. The new transactional regression suite exercised student, counselor, both parents, and cross-firm identities; exact-version/document checks; feedback/resubmission; forced step and link failures with rollback; atomic instance creation; dependency blocking; and preserved downstream work. Twelve real concurrent database connections/attempts (six workers) returned one linked task. Both database suites are wired into CI.

Golden-path browser coverage now includes task-linked transcript approval and essay changes → revision → task approval → standalone finalization, plus parent denial. The full E2E command discovered **25 tests and skipped all 25**, including the 21 golden-path tests, because Clerk development credentials are absent. No browser, mobile, keyboard, Storage/PostgREST, or live scheduler acceptance is claimed. Run those flows in the configured disposable app before acceptance; production is not a test target. The existing coarse same-firm table RLS model is unchanged; new RPCs are SECURITY INVOKER, keep RLS in force, validate caller identity/relationships, and deny anonymous execution. Local catalog checks supplement the database tests; hosted Supabase advisors were not run for this unapplied migration.

Release requirements: review and apply **00044_task_deliverable_review.sql** before deploying this code. No legacy ownership/completion backfill is included. Next implementation: **Phase D — preview, personalization, date provenance, and duplicate-plan handling**. Phase E notifications/audit event delivery remains unstarted.

### Phase D — Preview, personalize, and maintain application schedules

**Outcome:** Counselors know what a plan will assign and can keep it aligned with real application deadlines.

Work:

1. Add Apply plan within the student workspace with student context retained. Reuse the same application flow from global templates, bulk assignment, and college-list supplements.
2. Before publishing, preview resolved owners, actual dates, visibility, dependencies, unresolved identities, assumed deadlines, overdue dates, and existing duplicate plans. Permit per-instance edits to instructions, owner, priority, and due date.
3. Persist enough date provenance to distinguish application-derived dates, start-date offsets, and manual overrides. Use a single resolver for preview and save, revalidating at save time.
4. When an application deadline or round changes, show proposed changes to open linked steps/tasks. Apply accepted changes consistently; preserve completed work and manual overrides. Missing real deadlines must be labeled as estimates rather than authoritative dates.
5. Define date-only versus timed due-date semantics and use the firm timezone consistently. Avoid midnight-UTC deadlines appearing on the prior day or becoming overdue at the start of the intended due date.
6. Prevent accidental duplicate assignment in single and bulk paths, scoped to the relevant student and college/application. Support intentional repeat plans only through an explicit action.
7. Make active-workflow counts navigate to the students running those plans. Allow instance editing without retroactively changing the reusable template. Changes to templates must not silently rewrite existing plans.

Acceptance:

- Two colleges with different deadlines get correctly scoped schedules.
- Moving one application deadline changes only its eligible linked dates; manual overrides and the other college remain unchanged.
- Equivalent single and bulk assignment produce equivalent owners and dates.
- Preview and published results agree, or the user sees a clear conflict requiring an updated preview.
- Applying twice does not accidentally duplicate a plan or its tasks.
- Date displays and overdue classification are consistent around timezone boundaries and daylight-saving changes.

Primary code: workflow/applications/bulk actions, workflow template detail, student college-list client, workflow service, task sync, shared date utilities.

### Phase D implementation record — September 9, 2026

Status: **implemented locally; live acceptance remains open**. Continued on `codex/workflow-phase-c`, preserving the uncommitted Phase C work. Migration **00045_workflow_plan_schedules.sql** follows 00044. No production migration, deployment, automatic legacy backfill, or test notification was performed.

- Student Tasks now offers **Apply plan** with the student retained. Template, cohort, and college-supplement entry points use the same component, authorized resolver, and save action. Preview includes named owners, audience, prerequisites, calendar dates, estimates, overdue dates, missing identities, and existing plans. Staff can personalize title/instructions, owner, priority, and date before publishing. Owner resolution uses one authorized identity snapshot per student rather than repeating relationship reads for each step.
- New instances save their own instructions, audience, dependency, completion mode, owner intent, priority, timezone, and date provenance. Template edits cannot rewrite saved plans. **Edit step** on the student overview updates an open step and its linked task together; changing its date marks a manual override. Active-plan counts link to the students running those plans within the caller's caseload.
- Assignment is serialized per student/template/college scope. Repeated ordinary assignment returns the existing plan, including completed/paused plans; cancelled instances allow a new assignment. Intentional repeats require an explicit checkbox and retain an idempotency key. Concurrent personalized assignment reports a conflict if another copy won the race. Bulk failures identify the student and preserve earlier successful writes for safe retries.
- Date resolution is shared by preview, save, and default provisioning. College plans use their own application's deadline minus 45 days as the default start, with offsets retained relative to that application; explicit start dates use start offsets. Whole-student deadline anchors retain the selected application's identity. Missing/unverified dates are labeled as estimates; legacy application dates remain unverified until staff confirms them. Multiple applications for the same college require resolution before assignment.
- Application detail editing now previews eligible open plan/task date changes, then **Accept changes** saves the application and accepted schedule in one transaction. The proposal is recalculated under locks, so stale sources/targets conflict. Completed/skipped work, manual dates, other applications/colleges, and cancelled plans are preserved. Clearing an application deadline clears eligible derived dates; it does not invent a replacement deadline. A round change retains the selected application's identity and requires the counselor to review its deadline.
- Date-picker tasks store calendar dates separately from timed deadlines. End-of-day conversion uses the firm timezone; task lists/detail and portal dashboards display the calendar label, and due-today/overdue calculations use the matching boundaries. Recurrences and other explicitly timed work keep their existing instant. Existing task timestamps are not backfilled.
- Legacy plans require the explicit **Preserve current plan settings** action before personalization or template edits. This scoped, repeatable action freezes current effective values, keeps existing owners/dates/completion, and labels date provenance as legacy/unverified. Template updates are blocked while they would silently alter unsnapshotted steps; deletion cannot cascade through student plans. No ownership is inferred from audience.

Automated verification: type-check and lint passed; **251 unit tests in 31 files passed**. A fresh disposable PostgreSQL 16 database applied migrations through 00045, seeds, and isolation fixtures twice, then passed the existing isolation/deliverable suites and the new workflow-plan suite. Coverage includes two-college separation, accepted schedule updates, preserved manual/completed dates, stale schedule and assignment rejection, instance/template independence, legacy preservation, authenticated student/parent/cross-firm denial, and calendar/timed dates around DST. Twelve simultaneous assignments returned one plan, one step, and one task; twelve independent materialization attempts returned one linked task. Both concurrency suites and the plan regression suite are included in CI.

Golden-path coverage now drives preview/personalization, student-workspace duplicate reuse, and application schedule acceptance. **All 25 E2E tests skipped**, because Clerk development credentials and a disposable running app are unavailable; these are not passing persona tests. Still required: live counselor/student/both-parent flows, bulk and intentional-repeat UI, two-college schedule edits, stale-preview races, legacy preservation, mobile/keyboard interaction, and full Supabase/PostgREST verification. Supabase CLI advisor checks were not run. The changelog Markdown endpoint could not be fetched in this environment; no Supabase dependency/API version was changed.

Release: review/apply **00044 and 00045** before deploying these local changes. Separately review any legacy plan before preserving its settings; no blanket remediation is bundled. Next implementation: **Phase E — notifications and finishing the handoff**, with earlier live acceptance gates still open.

### Phase E — Notifications and finishing the handoff

**Outcome:** Both personas know when they need to act without receiving excessive notifications.

Work:

1. Emit assignment/published-plan, submission, changes-requested, approval/next-step, and relevant deadline-change events through the existing notification infrastructure.
2. Deep-link to the task. Use actual owner/reviewer identity, audience checks, and existing preferences. A published plan should generate a consolidated notification, not one email for every step.
3. Keep in-app state available even when email is disabled. Verify reminders include eligible overdue work and do not notify unresolved owners or leak hidden task content.
4. Record meaningful task transitions in the existing audit/activity trail. Make duplicate event delivery harmless.

Acceptance:

- Student gets an actionable assignment notice; counselor gets a review notice; requested changes return to the correct student; approval identifies the next action/person.
- Duplicate delivery does not create duplicate notifications.
- Preferences and visibility rules are honored for students, staff, and parents.
- A configured test scheduler actually runs the reminder path. Do not infer successful delivery from a registered cron alone.

### Phase E implementation record — September 9, 2026

**Implemented locally; live acceptance remains open.** Phases C–D are in [PR #41](https://github.com/studyworksprep/counselworks/pull/41). Phase E is isolated on `codex/workflow-phase-e`, based on that PR's head.

- Task assignment, plan publication, submission, requested changes, approval, reopening, attention, and deadline changes produce durable notices plus meaningful audit transitions. Initial plan publication consolidates per actual recipient; repeated writes reuse event keys. Deadline changes in one plan transaction consolidate per recipient. Every notice opens the canonical task route.
- Students receive their assignments/changes/approval; counselors receive work assigned to them and their review requests; only explicitly selected parents receive parent-owned task notices. Hidden/unresolved work never enters a recipient feed. Audience, membership and ownership are checked again when reading and delivering. Approval feed/task detail shows currently visible direct next steps and their responsible person; email links to that live context without retaining successor names.
- Existing preferences now expose separate task-update and task-reminder email controls on all three surfaces. Email-disabled users retain in-app notices. Eligible overdue work is included; submitted work reminds its reviewer. Daily firm-local event keys prevent repeat reminder notices.
- The one-minute Inngest drain consumes transactional notification rows. The daily reminder handler enqueues and drains the same receipts. Leases, frozen payloads and provider idempotency keys protect uncertain delivery retries; old uncertain sends stop automatic recovery and surface an unconfirmed-email message in the bell. Migration 00046 is additive; no historical ownership/date/completion backfill.

Verification actually run:

- Type-check, lint, and 264 unit tests across 33 files passed. Delivery tests cover disabled email, revoked access, stale/blocked work, independent preferences, escaped content, and retrying an uncertain receipt with the same payload/key. A timer-based handler harness exercises enqueue/drain and failure propagation; it is **not a live Inngest scheduler test**.
- Clean PostgreSQL 16: all migrations through 00046, seeds, fixtures twice, isolation, deliverable review, workflow schedules, and task notification regression suites passed. Counselor/student/selected-parent/other-parent/cross-firm fixture identities exercised transitions, privacy, publication consolidation, overdue reminders, lease recovery, duplicate prevention, and visibility revocation. Twelve concurrent assignments produced one plan/task; twelve concurrent materializations produced one task.
- Golden-path E2E was extended with publication/review/changes notification links; all **25 local tests skipped** without Clerk test keys. PR #41's configured CI run separately passed 17 browser tests, failed step 8c at the reviewer label, and did not run seven later tests. The explicit label fix was pushed to that PR as `dcd746b`; its rerun is pending. This is partial C–D live evidence, not Phase E browser/email/Inngest cron acceptance.

Release gates: review/apply **00044 → 00045 → 00046** before deployment. Run the configured disposable Clerk/browser acceptance and an actual Inngest dev reminder schedule, observing overdue-owner and submitted-reviewer notices, email-off feed retention, and duplicate-run behavior with test recipients. Existing earlier-phase live gates remain open. No production migration, deployment, or real-family notification was performed. There is no Phase F in this plan: next work is the combined live acceptance scenario and release review.

## Migration and release requirements

- First inspect the current schema, migrations, RLS, constants, and existing review/notification behavior. Keep new code in the established query/actions/workflow modules.
- Add forward migrations for required schema changes; do not edit historical migrations. Include RLS and isolation coverage for new tables and relationships.
- Do not infer historical task ownership solely from visibility. Produce a dry-run report of ambiguous legacy assignments and require explicit remediation where intent cannot be established.
- Preserve historical completion, submitted artifacts, manual deadlines, and existing permissions. Any data backfill must be scoped, repeatable, and separately reviewable.
- Use disposable test fixtures. Do not send test notifications to real families or mutate production records to prove a workflow.
- Update `docs/FIX_PLAN.md` with concise status links once implementation lands. Do not label implementation or live validation complete prematurely.

## End-to-end acceptance scenario

Use a counselor account with ordinary counselor permissions, a fictional senior, two parents, and two college applications with distinct deadlines.

1. Counselor opens the student's workspace and assigns a student-owned transcript request plus a per-college essay plan requiring review.
2. Preview confirms student ownership, counselor reviewer, correct audience, and application-derived dates. Resolve or visibly flag missing portal access.
3. Student opens the task from the dashboard, reads full instructions, and uploads the transcript into the linked request.
4. Student opens the essay from its task, edits, and submits for review. The dependent step remains waiting.
5. Counselor opens Needs review, requests changes, then approves the revised version after resubmission.
6. Student and counselor see consistent completion, the next step activates once, and the proper person is notified.
7. Student can see a shared counselor review step but cannot complete it. A parent can complete only explicitly parent-owned work.
8. Counselor changes one application deadline; preview preserves manual overrides and the other college's schedule.
9. Reopen a completion, retry a failed write, and repeat an assignment. Confirm no lost artifacts, duplicate tasks, or contradictory progress.
10. Verify dashboard totals, archived/hidden tasks, mobile layout, keyboard use, and cross-student/cross-firm authorization.

Run type-check, lint, unit tests, migration/isolation tests, and configured golden-path E2E. Add targeted regression cases for the transitions and failure paths above. Record which personas and paths were exercised live; skipped E2E remains an explicit verification blocker.

## Ready-to-paste Codex session prompt

```text
Implement the CounselWorks workflow improvements in docs/WORKFLOW_IMPROVEMENT_PLAN.md.

Read CLAUDE.md, applicable AGENTS.md instructions, docs/FIX_PLAN.md, docs/SECURITY.md,
docs/E2E.md, and docs/WORKFLOW_UX_REVIEW.md first. Inspect the current branch and
working tree; preserve unrelated changes. Reconfirm the source-based findings
against current code before changing it.

Start with Phase A and deliver it end to end, then continue through subsequent
phases in dependency order as capacity permits. Keep each phase reviewable and
update the plan with completed work, tests, decisions, and remaining blockers.
Do not claim later phases are complete if you only implement the first phase.

Reuse existing task, essay, document, application, workflow, and notification
systems. Follow the product decisions and acceptance criteria in the plan.
Prefer reasonable implementation decisions over repeatedly asking me questions;
ask only when a missing business decision materially changes behavior or access.

Exercise counselor, student, and affected parent flows in a configured disposable
test environment. Never report skipped tests as passing. If live credentials
are unavailable, continue independent implementation and automated verification,
and clearly list the live acceptance checks still blocked. Do not bypass auth,
contact real families, or change production data for testing.

At handoff, summarize the behavior changed, tests actually run, migration/backfill
requirements, remaining work, and the exact next phase. Do not deploy or apply
production migrations as part of this implementation request.
```
