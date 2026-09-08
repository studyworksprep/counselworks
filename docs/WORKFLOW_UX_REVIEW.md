# Counselor-to-student workflow review

Reviewed September 8, 2026, at commit `cc7a584` (main, synchronized with origin/main).

## Scope and evidence

This is a source-based end-to-end journey assessment, not a completed live usability test. The checkout has no `.env.local` or `.env.e2e`, no exported Clerk/Supabase/E2E configuration, and no running app was found. The golden-path suite was invoked: all 19 tests skipped because Clerk test credentials are absent. A test-site URL and test identities were requested. No real student records were modified and no messages were sent.

Type-check and lint passed; all 206 unit tests across 21 files passed. These checks do not establish that the live counselor/student journey works. No application code was changed for this review.

## Overall assessment

The product has useful building blocks: student-specific workspaces, reusable plans, dependencies, per-college supplements, recurring tasks, shared visibility controls, and task-to-workflow completion synchronization. But the user must supply too much of the connection between these pieces. The counselor can organize a process; the student gets several parallel lists and must infer where to act, what counts as done, and who acts next.

The highest priority is a dependable assignment → work → submission → review → next-step loop, with explicit ownership and a single actionable task view.

## Counselor journey

1. Open a student workspace. The new Tasks, Colleges, Applications, Essays and Documents tabs provide helpful student context. Creating a task from the student's Tasks tab preselects that student.
2. Create an important application task. The modal's “Assign To” only lists staff; “Related Student” and “Visible to” are separate controls. Staff-only is the first visibility option. A counselor intending “ask this student to draft an essay” must understand that linking a student is not the same as publishing the task to the portal.
3. Apply a reusable plan. From the student overview, navigate to the global workflow library, select a template, then select the student again and choose a start date. Per-college supplements instead start from a college-list row. Both routes exist, but require knowledge of the information architecture.
4. Inspect the resulting plan. The apply form offers no preview of resolved owners, actual due dates, missing student accounts, or tasks that will already be overdue. The template's active-workflow panel is a count, not a list of students that can be opened.
5. Follow progress. The student overview offers Complete/Skip controls for active steps. There is no dedicated workflow submission/review queue or direct link from a step to its supporting essay/document.

## Student journey

1. Land on the dashboard. Task titles and deadlines are visible, but the rows do not open the task or offer completion. The student must discover My Tasks in navigation.
2. Open My Workflows. This provides useful sequence/progress context, but steps have no action or link to the corresponding task. “Blocked” does not identify the prerequisite or person the student is waiting on; the student page does not enable assignee display.
3. Open My Tasks. Tasks are sorted by due date and display priority/overdue badges. Instructions are truncated to one line without an expand/detail control. The student can mark complete or add a personal task, but cannot indicate “working,” “need help,” or “submitted for review.”
4. Do the work. An essay or document task has no built-in handoff to the actual essay editor, upload form, or application checklist. Those modules must be found independently. Completing work in them is not wired into the workflow task's status.
5. Mark complete. This is wired to complete the linked workflow step and activate downstream tasks. However, a checkbox is the only evidence of completion; it does not validate the artifact or request approval. Completed rows have no undo control. The student receives no contextual explanation of what was unlocked or who acts next.

## Prioritized findings

### 1. Ownership and visibility are conflated — highest priority

**Evidence:** `web/src/app/(dashboard)/tasks/tasks-client.tsx`, `web/src/lib/actions/workflows.ts`, `web/src/modules/workflows/service.ts`, `web/src/lib/workflows/tasks-sync.ts`, `web/src/lib/auth/authorize.ts`.

Manual task assignment lists staff only. Workflow application builds its role-to-user map exclusively from staff assignments, so student/parent template roles are not resolved to their portal users. Unresolved steps retain a null assignee; their generated tasks fall back to the workflow creator. Reminder jobs skip steps with no assignee. Meanwhile, student task reads and completion authorization use student relationship plus visibility, rather than actual task ownership. A counselor-owned review task shared with the student can therefore appear in My Tasks with a completion control.

**Improve:** separate “Who does this?” from “Who can see this?”; resolve actual student/parent identities; allow a visible-but-not-actionable review step; warn before assigning work to a person without portal access. Preview owners before applying a plan.

### 2. Task displays do not lead into the work — highest priority

**Evidence:** `web/src/app/(student-portal)/student-dashboard/page.tsx`, `web/src/app/(student-portal)/student-tasks/page.tsx`, `web/src/components/cards/workflow-progress.tsx`.

Dashboard and workflow rows are passive. My Tasks truncates instructions without a detail view. There are no task-level links to the relevant essay, document request, or application.

**Improve:** one task detail view accessible from every surface, with full instructions, college/application context, owner, due date, and an appropriate primary action: Write draft, Upload transcript, Open checklist, or Submit for review.

### 3. Completion lacks a review and evidence loop — highest priority

**Evidence:** task actions and workflow sync above; `web/src/lib/actions/essays.ts`, `web/src/lib/actions/documents.ts`.

Essay review exists separately, but is not connected to workflow completion. A task can be checked off without submitting an artifact, and submitting/editing an artifact does not update the task. Downstream work can unlock on self-reported completion, including for tasks that should require review.

**Improve:** support task-specific completion rules. Simple reminders can remain checkboxes; deliverables should link an artifact and optionally require counselor approval. Offer Request changes, resubmission, and a counselor review queue.

### 4. Dates do not stay connected to application changes

**Evidence:** `web/src/lib/actions/workflows.ts` (`resolveDeadlineAnchors`, per-college application), `web/src/lib/actions/applications.ts` (`updateApplicationDetails`), `web/src/lib/actions/bulk.ts`.

Individual workflow application resolves dates at creation, including per-college start dates based on an application deadline minus 45 days. Updating an application round/deadline later does not reschedule workflow steps or linked tasks. Bulk application bypasses the single-student role/deadline resolution entirely. The same template can therefore behave differently depending on how it is assigned.

**Improve:** use one shared application service for single and bulk assignment. Preview the calendar and identify assumed/missing deadlines. On a deadline change, show proposed schedule adjustments and preserve deliberate manual overrides.

### 5. Recovery and error feedback are incomplete

**Evidence:** student task client, staff workflow list, task actions and workflow sync.

Completed student tasks have no undo. Staff can change task status, but the sync path only mirrors completion; reopening a task does not reopen its workflow step or reconsider downstream state. Student completion and staff step controls do not display returned action errors. Workflow application logs task-generation failures but still returns an apparent successful workflow creation.

**Improve:** show actionable errors and success feedback, provide Undo/Reopen with coherent downstream behavior, and detect/retry partial workflow creation without duplicate work.

### 6. Dashboard totals can contradict the task list

**Evidence:** `web/src/lib/db/queries.ts` (`getStudentPortalData`, `getStudentTasks`) and student dashboard.

“Open Tasks” counts a query limited to 10 records. Its query does not exclude archived tasks. The overdue count additionally omits the portal visibility filter, so it can count hidden staff tasks. “Total Schools” counts application rows rather than the college list. These are code-confirmed inconsistencies; their exact visible effects depend on the dataset.

**Improve:** separate total counts from preview lists, reuse the same visibility/archive rules, and label a limited list “Next 10 tasks.” Count schools from the college list.

### 7. Progress does not explain responsibility or waiting

**Evidence:** `shapeWorkflowRow` in queries, workflow progress card, student workflow page.

Progress totals include hidden steps while the student only sees visible steps. Blocked steps do not explain their dependencies. Assignee names are available but disabled in the student view. Finishing all visible work may leave the plan incomplete without an explanation.

**Improve:** label “Your work” and “Waiting on counselor,” show a safe prerequisite explanation, and distinguish personal completion from overall application readiness without exposing private step details.

### 8. Assignment and completion lack contextual notifications

**Evidence:** `web/src/lib/actions/tasks.ts`, `web/src/lib/actions/workflows.ts`, `web/src/lib/queue/functions.ts`.

Workflow deadline reminder code exists, but assignment/completion actions do not emit corresponding notification events. The workflow reminder targets resolved step assignees, exposing the ownership problem above. Email delivery and scheduler operation have not been verified live.

**Improve:** an in-app assignment inbox, configurable digest/reminders, a review notification on submission, and explicit next-step feedback. Deep-link notifications into the exact task. Avoid sending a separate email for every generated step.

### 9. Plans are difficult to personalize after assignment

**Evidence:** template detail client, student staff-workflow list, task client.

The apply dialog chooses student/start/name but does not preview or adjust individual dates and owners. Instance controls are mostly Complete/Skip. The ordinary task table has status/delete controls but no general edit form for correcting title, instructions, or due date. The template screen exposes technical concepts such as free-text Task type and Days from start.

**Improve:** assign plans directly from the student workspace, preview and tailor them before publishing, then allow per-student edits without modifying the reusable template. Explain effects on already assigned plans. Make active-workflow counts navigable.

## Suggested delivery order

1. Correct ownership, reminder recipients, dashboard counts, date propagation, and partial-write/error handling.
2. Add one linked task detail view and actionable dashboard/workflow rows.
3. Connect artifacts to submission, counselor review, changes requested, and completion.
4. Add plan preview/personalization, waiting explanations, contextual notifications, and coherent undo.

## Live acceptance walkthrough still required

Use disposable test counselor/student accounts and a fictional senior applying to two colleges with different deadlines. Assign an essay task, a transcript request, and a per-college supplement workflow. Verify what each persona sees and can complete. Draft/upload from the task, submit for review, request a change, resubmit, approve, and verify the next owner receives the next step. Then change an application deadline, undo a completion, try a failed save, and compare bulk with individual assignment. Repeat key student actions on a narrow viewport and keyboard navigation. Verify reminders separately without contacting real families.

The current golden-path workflow test applies a sophomore template and checks a single checkbox/progress increment. It does not cover the complete college-application deliverable/review loop or the recovery scenarios above.
