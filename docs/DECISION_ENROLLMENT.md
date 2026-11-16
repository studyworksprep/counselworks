# Decision and enrollment workspace

Each application now has a Decision and enrollment page, linked from the application
tracker, readiness dashboard and follow-through panel. The counselor caseload adds
an attention filter for decisions and enrollment, with links to open requirements.

## Working flow

- Counselors record a dated decision and, for acceptances, the existing enrollment
  choice. The current application, college-list outcome and immutable history update
  together. Corrections append an entry. Existing decisions are captured as existing
  records without inventing earlier changes or an author. Only one college can be
  recorded as committed for the student, including concurrent edits.
- Students and their assigned counseling team add custom next steps or explicitly
  start a suggested waitlist, deferral or enrollment checklist. Suggested steps are
  editable starting points. College deadlines must be verified and entered; no
  college requirement or due date is assumed.
- Steps support notes, a verified requirement deadline, confirmed-completion date,
  an existing document and application writing. Counselors can create a linked
  continued-interest or deferral letter in the existing essay editor. Those letters
  retain versioning and review tools but do not become application requirements or
  alter the original submission packet.
- Schedule one open follow-up per step, choosing an active owner and a reminder
  date. Counselors may reassign or reschedule; students manage their own follow-ups.
  Existing task notifications, preferences and reminder delivery apply. Completing a
  task does not confirm payment, enrollment or delivery. Marking the requirement
  complete or not required cancels its open reminder work.
- Each step belongs to the decision displayed when it was created. Recording a new
  outcome or enrollment entry cancels prior open next-step tasks while preserving
  their history and writing. A same-kind step can be explicitly reviewed against
  the current decision before reuse; changed outcome types start a new checklist.
- Deposits, college responses and enrollment actions still happen externally in
  the college portal. This workspace records the outcome; it does not submit forms,
  send letters, pay deposits or synchronize college portals.

## Sharing and access

Factual decisions and enrollment retain the application's existing student and
family visibility. Only editable counseling staff can record those facts. Assignment
rules remain in force; read-only staff can view without making changes.

Working steps start with student and counseling-team access. Only the student can
approve parent access to each step, including its notes and follow-up metadata.
Content edits withdraw consent in the same transaction that narrows derived task
visibility. Both linked guardians can read approved steps; only the assigned parent
can complete their own shared task. Parents cannot change decisions, checklist
content, owners, dates or sharing. Task reads, feeds and queued reminders recheck
current source consent, assignment and decision relevance.

Writing and documents retain independent permissions. A shared step never grants
access to a linked resource, exposes its hidden ID/title or copies private content.
Unavailable links can be preserved while editing without revealing the resource.
Interviews, stories, strategy briefs and submission packets keep existing controls.

## Implementation and verification

Migration **00063_decision_enrollment.sql** adds decision events, versioned next
steps, a task source link and a writing-phase marker. History application, projection
guards and task synchronization are transactional. RLS and invoker-only functions
with fixed search paths back explicit query/action authorization. Optimistic
revisions preserve unsaved text and reject stale decisions, steps and task changes.

Verification includes fresh migrations with twice-applied fixtures, SQL role and
cross-firm isolation, immutable history, prompt/packet separation, reminder consent,
concurrent decision edits, concurrent enrollment choices and duplicate follow-ups.
Browser journeys cover counselor/student/both-parent access, resource withdrawal,
assignment and read-only restrictions, stale edits, decision transitions, enrollment
confirmation, mobile overflow and accessibility. The existing connected-workspace
and full golden-path suites remain release gates.

Apply the reviewed migration **before** deploying its application code. This is an
implementation change; production migration and deployment are separate. Existing
application code's direct decision writes will be rejected once this migration is
applied, so coordinate migration and deployment. A rollback to older application
code requires retaining the new decision-recording path or temporarily disabling
that UI; do not remove history guards or delete recorded decisions to roll back.
