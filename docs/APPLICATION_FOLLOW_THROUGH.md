# Application follow-through

The application and readiness pages now lead to a follow-through panel alongside
the final submission handoff. The counselor caseload has a follow-through filter
and direct actions for unconfirmed acknowledgment, portal access and materials.

## Working flow

- After a submission is recorded, add the college acknowledgment, applicant portal,
  and individual materials. Manual submissions are supported; they do not create
  a review packet or verified college receipt.
- Materials distinguish needed, requested, sent, received and waived. Record sent,
  confirmed receipt and last-checked dates. Receipt requires a date; dates cannot
  be future or precede sending. Portal activation remains separate from receipt.
- Add a confirmation reference or tracking note and optionally link an existing
  student-visible document. Use the public portal login URL without credentials.
  The panel links back to the original final-review/submission workspace.
- Schedule one open follow-up per item with an active responsible person and a
  calendar due date. Counselors can change the owner/date; students create and
  reschedule their own tasks. Open the normal task detail to complete the work.
  Completing a task never confirms college receipt. Recording receipt or a waiver
  cancels open follow-ups for that item, stopping reminders without erasing history.
  Portal check-ins can recur by creating a new follow-up after the prior one closes.
- The existing notification queue and daily reminder job handle due/overdue work,
  current recipient access, notification preferences and duplicate suppression.
  No new reminder scheduler, email transport or service client is introduced.
- Recorded milestones show dates from the current visible items. They are not an
  immutable edit-history feed or an automatic sync with college portals.

## Sharing and access

Tracking starts with the student and assigned counseling team. Read-only staff
can view but cannot change tracking or follow-ups. Only the student can approve
parent access to each item, including its notes and linked task metadata. Both
linked guardians see that approved item; only an assigned parent can complete its
follow-up. Parents cannot edit tracking, assign/reschedule tasks or grant access.

Editing tracking resets parent consent. The same transaction narrows derived task
visibility; direct task reads, notification feeds and queued email delivery also
recheck current consent. Reassignment, membership and counselor assignment rules
continue to apply. Withdrawing an application pauses reminders and further
tracking edits, while the student can still withdraw parent sharing.

Documents keep their own permissions. Linking a document never shares it with
parents, copies its content or changes download authorization. An unavailable
attachment is omitted from portal payloads; editing preserves it unless the user
explicitly chooses another document or removes the link. Submission packets,
essays, private source interviews and coaching retain their existing controls.

## Implementation and verification

Migration **00062_application_follow_through.sql** adds a tenant-scoped tracking
table and a source link on existing tasks. RLS, invoker-only guards and explicit
query/action authorization cover every entry point, including the service fallback.
Tracking revisions and task notification revisions reject stale saves. Source
locks and a partial unique index prevent duplicate open follow-ups. Task instructions,
source and audience cannot be detached or widened through the generic task editor.

Checks cover date/status validation, caseload actions, fresh migrations and repeated
fixtures, both guardians, student ownership, cross-firm and withdrawn-assignment
access, read-only staff, source/attachment withdrawal, reminder deduplication,
stale edits and concurrent creation/rescheduling/consent withdrawal. Browser checks
exercise the three role surfaces, task completion, rescheduling, mobile overflow
and accessibility. Existing task-delivery tests cover preferences and retries.

Apply the reviewed migration **before** deploying the application code. This PR
is implementation only; production migration and deployment require a separate
rollout. An application rollback can leave the additive tracking records intact.
