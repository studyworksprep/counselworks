# Final application review and submission handoff

CounselWorks now connects the application tracker and readiness dashboard to a
review packet of saved responses. The student still submits through Common App,
Scoir or the college portal. CounselWorks records the student's report of that
submission; it does not send an application or verify a college receipt.

## Flow and personas

1. Open **Final review & handoff** from an application or its readiness card.
   Linked student-visible responses join automatically. Select general essays
   (such as a personal statement) explicitly for this application.
2. Review the exact saved writing, assigned prompts and limits. Unsaved working
   text, empty responses, exceeded assigned/current published limits, missing
   universal required responses, requested revisions, open essay revision tasks,
   and incomplete checklist items block approval. Unverified prompt coverage,
   changed published questions and estimated deadlines require a manual check.
   An absent checklist is explicitly flagged, not treated as verified completion.
3. Prepare a packet. Its response text, version IDs, prompt/limit snapshots and
   application context are fixed. Students and counseling staff approve
   independently, with an explicit confirmation of the displayed writing and
   current portal requirements. Neither can approve for the other.
4. Copy individual responses or download a UTF-8 text packet after both approvals.
   The download preserves paragraphs and Unicode and excludes comments, version
   commentary, source interviews, story notes, revision instructions, private
   counselor notes and receipt identifiers.
5. After submitting in the external portal, the student confirms the exact
   packet, submission date, platform and optional receipt reference. That single
   transaction records the handoff and updates the existing application tracker.
   Date validation follows the firm's calendar, including near UTC midnight.
   The submission record and its approvals become immutable. Staff's existing
   manual application-status path remains available and does not manufacture a
   packet approval or a student confirmation. Returning a tracker to Submitted
   preserves an existing submission date.

Staff with editing access can prepare packets and give counselor approval;
read-only staff can inspect permitted records. Assignment rules still apply.
Students can prepare, approve, withdraw their approval, control parent sharing
and record a submission. Parents have a read-only page showing application
status and the most recent packet currently shared with them. With no shared
packet, the page makes no claims about private review progress.

## Freshness and consent

Every approval belongs to a particular packet and the saved versions inside it.
A fingerprint covers the selected responses, current working text and status,
versions, prompt context, published requirements, checklist, deadline and open
revision work. Later changes make the packet outdated; they do not erase the
prior evidence. An updated packet needs fresh student and counselor approvals.
Preparing a newer packet also supersedes earlier packets for future handoffs.
An opaque application pointer keeps that rule enforceable even if a newer
packet's contents become private. If a sharing change hides that newer packet
from the student, the counselor prepares its replacement.
The page retains a deliberate displayed snapshot until an explicit refresh,
while server-side checks reject stale confirmations and simultaneous edits.

Preparing or approving a packet does not change essay status, writing, saved
versions, source access or existing review-submission markers. A counselor's
final packet approval supplements the existing individual-essay workflow.

Packets start private to the student and counseling team. Only the student can
share a student-approved packet with parents. Every included essay must
independently permit family access, and must still contain exactly the packet's
writing, prompt, limits and saved version. Changing or withdrawing any essay
pauses access to the entire packet, including direct download URLs. Parents do
not gain draft-version history, private feedback or story/interview context.
Both guardians have the same explicitly approved family audience. Parent views
identify saved approvals; they do not assert that private review checks are
currently complete. The student can stop sharing a submitted packet.

Submitted packets remain available to authorized staff and students as a record
of what was reported submitted, even if working materials later change. The
20 most recent packets appear on the review page. Receipt references are shown
only with an accessible packet, never embedded in the clean text export.

## Implementation and rollout

- Migration **00061_application_final_review.sql** adds one tenant table, RLS,
  an application's latest-packet pointer, source/identity guards and invoker-only functions. It introduces no backfill,
  new service-role client, security-definer function, model call or background job.
- User requests use `getDb()`. The query/action layer repeats student, assignment
  and audience authorization independently of RLS. Download responses are private,
  uncached and checked again on every request.
- Packet mutations lock the application and source essays in a consistent order.
  Revision comparisons reject simultaneous approvals. Fresh database snapshots
  after lock waits prevent a handoff from using an essay changed while waiting.
- The student application-update policy exists to support this atomic handoff;
  a trigger rejects other student application edits and requires the corresponding
  approved, recorded packet.

Apply the reviewed migration **before** deploying the application code. Production
rollout is separate from this implementation; no production data was changed.
Rolling back the UI can leave the additive table and audit evidence in place.

## Acceptance coverage

The SQL suite exercises independent approvals, stale revisions, immutable packet
content/submissions, source withdrawal, both parents, cross-firm and unassigned
staff denials, read-only staff, prompt changes, current and assigned limits,
missing responses, explicit general-essay selection and private-text exclusion.
The concurrent suite covers eight approval writers and a submission waiting
behind an essay save. The browser acceptance test exercises counselor → student
→ both parents → clean export → changed writing → fresh approvals → submission,
then essay withdrawal, packet unsharing and assignment withdrawal. It includes
phone-width and accessibility checks. The golden path checks all three entry
points alongside the existing full application journey.

Regression coverage also checks invitations for existing sign-in identities
that have no linked portal account. Local pending-invite and account-ownership
guards still apply. The student editor keeps writing controls disabled until
its event handlers are ready; the browser test delays scripts deliberately and
checks the exact saved revision before verifying parent visibility.

Local validation: production build, type-check, zero-warning lint and **498 unit
tests** passed; **48 interview/workspace browser tests** and **26 golden-path
tests** passed (two local Stripe checks were skipped because payment credentials
were not configured). The final schema applied from an empty database with
repeated fixtures, and the new SQL isolation and concurrent-write suites passed.
All 16 database regression/audit scripts ran successfully; the legacy-owner audit
requires its explicit fixture-firm parameter. Database lint reports only the
pre-existing unused variable in `write_essay`, with no new findings. Mobile and
accessibility checks cover the new page content for all three personas. See the
pull request for hosted CI results.
