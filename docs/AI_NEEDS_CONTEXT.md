# Interview assistance: needs more context

This follow-up to [PR #80](https://github.com/studyworksprep/counselworks/pull/80)
separates missing evidence from a proposed story, theme or strategy note. A request
can return **Needs more context**, with no proposed items, a concise explanation,
one useful follow-up question and citations to the explicitly selected sources.
The question invites the student's own detail or interpretation. No connection,
no settled meaning and choosing to leave the question for later are valid.

## Student and counselor flow

Students see the question and can expand its cited source text and revision. A
cited interview answer opens the existing response with the question displayed
separately; the saved answer is never replaced or prefilled with model text. A
story-based gap opens the existing story bank, where students choose what to
write, confirm and share. A context gap has no save-as-story or save-as-theme
control. A documented ordinary event or a student-stated connection can still
produce a modest suggestion; missing a dramatic lesson is not a reason to demand
more context.

Counselors review and edit the follow-up question before adding it to the existing
Counselor follow-up thread. The stored result fixes that destination, including
when a direct database call supplies a story title or strategy-section revision.
The question starts visible to its respondent and counseling team. The respondent
writes their own reply and explicitly chooses whether to share the question/reply
with family. The request's cited context stays in its owner's private AI history;
the reviewed follow-up retains the existing source-answer link when available.
Raw selected source text is not published with the question.

Parents retain their separate interview-question assistance and read only
independently shared student material. They cannot request student story, theme
or strategy assistance or read another person's private context-gap history.
Question mode can start gently without sources and continues to return bounded
questions from the allowed questionnaire.

## Validation, access and earlier results

New responses name one outcome: `suggestions` with 1–4 items and no context gap,
or `needs_more_context` with zero items and one cited question. Mixed outcomes,
missing questions, invented/duplicate/unselected citations and unsupported modes
are rejected. Reasons and questions are each limited to 600 characters.

The existing owner, firm, caseload, respondent, source-revision, permission-stamp,
quota and in-flight-withdrawal checks apply to both outcomes. Source changes hide
cached gaps and refuse stale follow-up saves while retaining edits in the review
form. Adding a reviewed question is atomic and single-use. Reviewed questions and
respondent replies retain their existing independent sharing behavior; a later
source change does not rewrite them.

Earlier stored result JSON is unchanged. A read adapter preserves its normal
review and acceptance paths; malformed new outcomes cannot be treated as older
suggestions. No existing result is automatically reclassified, confirmed or
shared, and no bank entry, brief section or essay is backfilled.

## Database update and release

Migration **00070_student_ai_needs_context.sql** replaces the old minimum-one-item
constraint with the two explicit outcomes, validates gap citations against the
request's selected references, and guards the reviewed-question destination in
the existing acceptance function. Both functions remain SECURITY INVOKER, with a
fixed search path and no anonymous execution. No table, role, service-role client,
provider, package or sharing scope is added.

Apply the reviewed migration before deploying the new application. It accepts
the older result format, so the preceding application remains compatible during
that order of rollout. Implementation and verification use local/disposable data;
production migration and application rollout are separate from this follow-up PR.

## Verification

Unit checks cover exclusive outcomes, real selected citations, bounded questions,
legacy reads without data conversion, and denial of student acceptance through
the counselor action. SQL checks use actual authenticated roles to verify private
history, no gap-to-story/strategy conversion, edited private follow-up creation,
single use, source withdrawal, quotas, explicit respondent sharing, earlier-result
acceptance and cross-firm/anonymous isolation.

The browser journeys exercise the real app, actions, local database and Clerk
development sessions with a loopback provider fixture. They check student-authored
responses, source previews, counselor question review, separate parent access,
independent sharing of a reply, preserved bank/brief records, stale generation,
phone layout and accessibility. This proves integration behavior rather than
live-model quality. Final results and any fictional live-model samples are
recorded in the follow-up PR and the quality review record.

Local results: zero-warning lint, type-check, **686 unit tests**, production
Webpack build, and all **10 interview-AI browser journeys** passed. The phone
context-gap card was inspected visually; the browser checks found no accessibility
violations or horizontal overflow. All 70 migrations and fixtures applied to a
new disposable local database. The original interview-AI, new context-gap, and
conversational-interview SQL suites passed there. The changed functions remain
invoker functions with `search_path=public`, and anonymous acceptance is denied.

New live-model samples were not collected for this extension. The browser provider
fixture verifies the new result contract and the complete review/sharing path;
it does not establish how consistently the live model chooses the outcome or asks
a useful question. The original review's semantic limitations still apply. The
updated thin-story/weak-theme corpus cases are ready for a separately authorized
live review. No temporary review route or authentication exemption is included.
