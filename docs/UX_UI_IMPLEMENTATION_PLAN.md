# UX/UI implementation plan

Created September 9, 2026. Status: **planned; no implementation in this document is complete.**

Source: [Interactive role review](UX_UI_ROLE_REVIEW_2026-09-09.md), performed at commit `a6f0a13`. This plan follows the workflow implementation; it does not restart Phases A–E of [the workflow plan](WORKFLOW_IMPROVEMENT_PLAN.md). Existing release and live-acceptance gates remain open until independently verified.

## Objective and product decisions

Make ownership trustworthy, priority work discoverable, and common actions usable across desktop and phone layouts. Preserve the existing visual identity and working task/plan architecture.

- Staff Management contains staff only. Client access stays in the established student/family access flows. An unknown role must never visually default to Owner.
- My Tasks means assigned to the signed-in person. Shared visibility is not ownership. Preserve explicit student/family workspace scopes when repairing the global default.
- Review queues represent work the signed-in reviewer may actually review; their counts and destinations must use the same eligibility rules.
- Use the shared task status vocabulary. Do not rename persisted enum values just to improve labels.
- Keep task responsibility separate from visibility. Do not broaden family access to make an empty plan page look populated.
- Rename the parent's Students navigation entry to College Lists. Do not build a new student-management feature for this label correction.
- Use compact actionable billing/signature alerts on the parent dashboard, with detailed billing and preferences in dedicated sections or destinations.
- Prefer a compact plan preview with expandable step edits and a persistent action area; prefer one selected day of booking slots with a nearby confirmation summary.
- No schema changes or backfills are expected. If inspection establishes a need, explain it and add a forward migration with relevant isolation coverage; preserve historical migrations and records.

## Phase UX1 — Trustworthy roles and task ownership

**Priority:** first. Review findings 1 and 2. Suggested PR: `fix: correct staff roster and personal task scope`.

Work:

1. Inspect existing staff-role constants and membership permissions. Filter the staff settings query/presentation consistently, including the displayed member count. Render unknown roles safely.
2. Verify the staff role-change/removal server actions cannot be used through this staff-management path to mutate client memberships. Reuse centralized authorization and preserve legitimate client-access actions.
3. Normalize the global task view on both server and client, including absent/invalid view parameters and navigation back to My Tasks. Do not change the meaning of an omitted filter in unrelated embedded/query consumers.

Starting points: `web/src/app/(dashboard)/settings/settings-client.tsx`, `web/src/lib/actions/settings.ts`, `web/src/app/(dashboard)/tasks/page.tsx`, `web/src/app/(dashboard)/tasks/tasks-client.tsx`, and `web/src/lib/db/queries.ts`.

Acceptance:

- Owner sees staff only, with accurate roles/count; student and parent records have no editable staff rows. No actual client role is changed during verification.
- Fresh `/tasks`, explicit personal view, and returning from another view show only the signed-in counselor's assignments, even with student/parent/other-staff tasks in fixtures.
- Team/Student views and embedded student/family workspaces retain their intended scopes and authorization.
- Regression tests cover mixed memberships, direct-action denial where relevant, default task scope, and cross-firm restrictions for touched access paths. Check affected portal behavior live.

## Phase UX2 — Responsive staff workspaces

**Priority:** next. Review finding 3. Suggested PR: `fix: make student workspaces and task lists responsive`.

Work:

1. Adapt layout to available content width; collapse the student switcher earlier and reduce summary/body column counts before controls collide.
2. Keep task title, owner, status, and due date readable at narrow desktop widths. Use an intentional compact/card presentation or deliberate secondary-column treatment rather than forcing all columns into the viewport.
3. Add an evident, keyboard-usable way to reach overflowed student section tabs. Normalize summary card heights and wrap long names/amounts safely.

Acceptance:

- Visually inspect 390, 768, 1024, approximately 1057, and 1366 pixel widths, with navigation expanded/collapsed where supported.
- No overlapping assignment controls, clipped balance, colliding meeting actions, or page-level horizontal overflow. Intentional tab scrolling remains discoverable.
- Due dates remain visible in the primary task presentation; every secondary action remains reachable.
- Check long names, larger balances, and populated tables. Keyboard focus stays visible; changed form controls have accessible labels. Preserve the successful stacked portal layouts.

## Phase UX3 — Coherent tasks, review queues, and navigation

**Dependencies:** UX1; coordinate task presentation with UX2. Review findings 4–7 and related copy polish. Suggested PR: `feat: clarify role dashboards and task next actions`.

Work:

1. Reuse shared status labels in filters and rows; include submitted and changes-requested states. Add a prominent Needs review entry with a count on staff dashboards and Tasks.
2. Separate student dashboard My work from Waiting on others. Compute counts from matching authorized scope, independently of preview-list limits, and exclude archived work consistently.
3. Show a responsible person or safe role label for waiting work where permitted. Explain that overall plan progress can include private staff work without disclosing that work.
4. Render Retry only when a relevant recoverable failure exists and the actor is authorized. Preserve ordinary completion, submission, changes-requested, and reopening controls; enforce recovery permissions server-side as well.
5. Make Workflow Steps This Week open matching actionable work with a supported filter; align metric/query/date boundaries. Add consistent counselor navigation to the accessible plan library. Rename parent Students to College Lists and make counselor dashboard copy personal.
6. Add a contextual counselor contact action to relevant empty states. Render a readable task reference in contextual messaging while retaining the authorized canonical deep link. Normalize priority/state/timezone labels using existing helpers and correct date-specific timezone handling.

Acceptance:

- Review count, queue rows, and task actions agree for ordinary counselor permissions. Existing review authorization is unchanged.
- Student dashboard matches the ownership split on My Tasks; shared counselor/parent tasks do not inflate personal-action counts.
- Normal student tasks and standalone parent tasks have no unexplained Retry control. A supported failure remains recoverable by its authorized actor.
- Dashboard metric destinations match their labels, and portal navigation names match page titles.
- Test mixed ownership, all supported statuses, archived/hidden tasks, and any changed date filters. Do not expose hidden task names, private fields, or unauthorized message context.

## Phase UX4 — Scannable plan assignment

**Dependencies:** UX2/UX3 presentation conventions. Review finding 8. Suggested PR: `feat: streamline plan preview and assignment feedback`.

Work:

1. Show a compact step summary with title, actual owner, visibility, and resolved due date; expand a step to edit details. Keep warnings and unresolved owners visible without expanding every step.
2. Keep Back/Apply/Cancel reachable in a persistent footer that does not cover content or keyboard focus. Use a suitable wide dialog/drawer on desktop and a usable small-screen treatment.
3. Translate raw role/date metadata into plain language. Preserve all existing validation, personalized values, duplicate protection, and assignment behavior.
4. After success, show a clear confirmation and View student's plan action using the actual returned instance/student.

Acceptance:

- Preview a five-step and a longer plan on desktop and phone. Edit owner, date, instructions, and priority, collapse/reopen the editor, and verify values survive and persist correctly.
- Unresolved owners and invalid inputs stay evident; failed application retains edits; duplicate/repeated requests preserve current idempotency guarantees.
- Keyboard users can enter/exit step editors and reach final actions. The success destination opens the assigned instance, not the template catalog.

## Phase UX5 — Parent priorities, settings, and booking

**Dependencies:** UX3 navigation and ownership conventions. Review findings 9–10 and settings polish. Suggested PR: `feat: focus family dashboards and simplify booking`.

Work:

1. Lead the family dashboard with child progress and a concise action summary. Retain prominent actionable signature/payment notices; move detailed invoice history into an accessible billing destination/section.
2. Separate personal notification/availability settings from firm/team/agreement administration. Reuse existing settings components and persistence; maintain role-appropriate entry points and old links where practical.
3. Present booking by selected day with a nearby/sticky selected-time summary and a clear Continue/Confirm progression. Keep timezone, counselor, child, attendee choice, and optional note explicit.

Acceptance:

- At phone and desktop widths, a parent can locate the child's next action, book a meeting, and reach invoice details and notification preferences without hunting through unrelated content.
- Signature/payment alerts remain visible when needed. Existing invoice/payment/signature actions retain permissions and destinations; no payment or signature is required for this layout review.
- Owner and counselor can find authorized personal settings; portal users cannot reach firm administration. Saved settings survive reorganization.
- Selecting/changing a booking day/time preserves valid selections and clears invalid ones with an explanation. Confirm is close to the selection and does not overlap content.
- Recheck availability on submission and handle a taken slot without losing the note. Use local fictional attendees and suppress outbound delivery for booking acceptance.

## Phase UX6 — Integrated acceptance and handoff

**Dependencies:** UX1–UX5. Suggested PR: final regression coverage and implementation records, or include coverage with each preceding PR and use this phase for integrated validation.

1. Repeat owner, ordinary counselor, student, and parent interactive journeys against the changed build. Add second-parent and multi-child fixtures for ownership/navigation checks.
2. Exercise a populated essay/document request: assign, work, submit, request changes, resubmit, approve, and verify the dependent next step. Check hidden staff work stays hidden and only the selected parent can act on parent-owned work.
3. Repeat key paths at the viewport widths above and with keyboard navigation. Record pages/personas actually exercised and remaining gaps; avoid claiming a formal accessibility or performance audit.
4. Update this plan's phase records and add concise status links to `docs/FIX_PLAN.md`. Keep prior workflow release/notification gates distinct: these UI changes do not prove production migrations, actual scheduled email delivery, or Stripe behavior.

## Verification and delivery rules

- Keep phases reviewable; add targeted regressions with behavior changes rather than delaying all tests to UX6. Do not write implementation-mirroring tests solely for copy/spacing edits; visually verify those changes.
- Follow `CLAUDE.md`: run type-check, lint, and unit tests before commits. Extend relevant golden-path E2E for changed user behavior and run configured coverage. Skipped tests are not passes.
- Run build validation after structural UI changes. For changed database/authorization behavior, run the relevant migration/isolation suites; use a disposable database for reset-based tests.
- Rebuild/restart when inspecting a production-mode local server so the browser is showing current code.
- At each phase record: changed behavior, tests actually run, live roles/viewports, decisions, schema requirements, and the exact next phase. Implementation complete and live acceptance complete are separate statuses.
- Preserve unrelated working-tree changes. Inspect current branch/remote/PR state before choosing a `codex/` branch and PR base; do not assume the Phase E PR is still open or merged. Do not deploy, merge PRs, apply production migrations, or contact real families as part of this plan.

## Local handoff context — recheck before relying on it

- Workspace: `/Users/juliomachado/Code/counselworks`; app commands run in `web/`.
- At planning time: branch `codex/workflow-phase-e`, HEAD `a6f0a13`. The UX review and this plan are local documentation additions. Remote PR status was not rechecked in this planning session.
- The review used Docker and local Supabase with migrations through 00046. App URL: `http://localhost:3000`. The working server was built and started with `npm run start -- --hostname localhost`; binding only to `127.0.0.1` previously caused a local Clerk/Next proxy issue. Check running services before starting duplicates.
- Local configuration is in gitignored `web/.env.local` and `web/.env.e2e`. Verify needed keys without printing their values. Do not commit credentials or replace them with production keys.
- Review identities: `cw-ux-owner+clerk_test@example.com`, `cw-ux-counselor+clerk_test@example.com`, `cw-ux-student+clerk_test@example.com`, `cw-ux-parent+clerk_test@example.com`, and `cw-ux-parent2+clerk_test@example.com`. These are Clerk development test accounts; the documented test email-code flow uses `424242`. Recheck that they still map to the fictional local firm. Automated E2E has its own fixture setup described in `docs/E2E.md`.
- Sam's local student ID is `a0000000-0000-4000-8000-000000000041`. The review applied Junior Year Anchors and completed Paula's sample budget task. Reuse/inspect rather than blindly duplicating these records. Do not reset the local database without preserving any later work.
- Email delivery, Stripe, and actual background reminder execution were not validated in the review. Sparse college/application/document data and the fixture's portal-account notice are limitations, not confirmed UI defects.

## Phase record

| Phase | Implementation | Live acceptance | Next step |
| --- | --- | --- | --- |
| UX1 | Not started | Not run | Reproduce roster and personal-task defects |
| UX2 | Not started | Not run | After UX1, repair staff layout |
| UX3 | Not started | Not run | Align role-aware task semantics |
| UX4 | Not started | Not run | Streamline preview |
| UX5 | Not started | Not run | Reorganize family/settings/booking |
| UX6 | Not started | Not run | Integrated role walkthrough |

## Ready-to-paste session prompt

```text
Implement docs/UX_UI_IMPLEMENTATION_PLAN.md in /Users/juliomachado/Code/counselworks,
starting with Phase UX1. This is the follow-up to the interactive role review,
not a restart of Phases A–E in the older workflow plan.

Read CLAUDE.md, applicable AGENTS.md instructions, docs/FIX_PLAN.md,
docs/SECURITY.md, docs/E2E.md, docs/UX_UI_ROLE_REVIEW_2026-09-09.md, and the new
implementation plan. Inspect the current branch, working tree, and remote/PR
state; preserve unrelated changes and the local review/plan documents. Choose
a codex/ branch and correct base without assuming Phase E's merge status.

Reproduce the current issues, then deliver UX1 end to end and continue in phase
order as capacity permits. Keep each phase reviewable. Preserve existing role,
visibility, task, plan, notification, and payment behavior except for the changes
specified in the plan. Reuse the established queries/actions and shared constants.
Make reasonable implementation decisions without repeatedly asking for approval.

Use the plan's local setup notes, but recheck services and configuration. Exercise
the affected owner, counselor, student, and parent flows through actual development
account sessions, including narrow layouts and keyboard use. Use fictional local
data, never bypass auth, print/commit secrets, or send messages to real families.
Rebuild/restart the app as needed to review current code. Do not reset existing
local data blindly.

Run required repository checks and targeted regression/E2E coverage. Record skipped
or blocked tests honestly and continue independent work. Update the phase record
and docs/FIX_PLAN.md with completed behavior, tests, live verification, remaining
gaps, and the exact next phase. Do not claim the broader workflow/email/payment
release gates are satisfied by this UI work. Do not deploy, merge, or apply
production migrations. At handoff, summarize changes, verification, any migration
requirements, and what remains.
```
