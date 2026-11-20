# Shared student context and interview assistance

The **AI interview assistance** view is part of Interview & Stories on the
counselor, student and family routes. It uses the existing questionnaire and
connects reviewed suggestions to the existing follow-up, story bank and strategy
brief workflows. It does not silently update the student's profile or writing.

## How it works

1. Select the interview respondent (counselors), then **Review AI context**.
2. Choose interview questions, possible stories, narrative themes, or counselor
   strategy notes. Preview and explicitly select supporting saved material.
3. **Ask for suggestions** sends only that selected material, the relevant
   questionnaire prompts and task instructions to the existing Anthropic provider.
4. Review the suggestion and its cited sources. Students and parents can explore
   a question in their own interview and write their own response. Counselors can
   edit and publish a follow-up. Students/counselors can save story and narrative
   drafts; only counselors can save strategy drafts.

Every saved story or narrative starts unconfirmed for the student and counseling
team. The student confirms accuracy and chooses family sharing through the existing
bank controls. Strategy notes create a private section or append to its existing
text; appending resets publication, student review and parent consent. Existing
text and student feedback are preserved, with revision checks against concurrent
edits. Nothing confirms a student's identity, publishes a brief, or shares a story
automatically. An accepted item is a separately reviewed record and follows that
record's existing sharing rules; later source-answer changes do not rewrite it.

## Context and privacy

Context is bounded by the **intended respondent**, even when the requesting
counselor has broader access:

| Material | Student interview | Parent interview |
| --- | --- | --- |
| Saved answers | Student's answered/still-exploring responses | That parent's answered/still-exploring responses |
| Follow-up replies | Student's own replies | That parent's own replies |
| Story/narrative bank | Student-confirmed entries | Confirmed entries independently shared with family, with all supporting stories still shared |
| Strategy brief | Shared, student-reviewed sections with current sources | Same, plus explicit student approval for parent access and family-visible sources |
| Excluded | Skipped/discuss-with-counselor answers, counselor-private notes, original story snapshots, unconfirmed entries, other respondents' answers, essays, contacts and financial-profile fields | Same exclusions; no other parent's private answers |

Question assistance may start without saved sources. Story suggestions require
student answers; themes require confirmed stories; strategy notes require student
answers or confirmed bank entries. Parents have question assistance only. Skipped, legacy discuss-with-counselor, deferred and declined topics are excluded from the allowed questionnaire. Inactive deterministic follow-ups are excluded until their trigger is active again. The new independent counselor-discussion checkbox does not suppress an answered preference. Structured responses supply readable text with the same revision and permission checks.

Generated suggestions are private to their requester. Reads, generation and
acceptance recheck firm, assignment, role, respondent, source revisions and
permissions. Source changes or withdrawal hide cached suggestions and block stale
acceptance, including changes during a model request. Marking a topic skipped or
for counselor discussion also hides previously generated questions about that
topic, even when no sources were selected. The query layer repeats these checks
for the local development service-role fallback.

Limits: 20 selected sources, 30,000 source-text characters, 1–4 suggestions per
request, 10 attempts/hour and 40/day per person/firm. A separate content-free quota
ledger prevents withdrawn sources from resetting the allowance. UI history covers
30 days; this is a visibility window, not an automatic database-deletion schedule.
Provider failures never overwrite interviews, stories, briefs or essays. Errors
and server logs omit student text and provider response bodies.

## Implementation and rollout

- Shared context and interview assistance are deployed; production migrations **00064_student_ai_context.sql** and **00065_conversational_interview.sql** are applied. Later planning and coaching releases are recorded below.
- Reusable context: database `student_ai_context` and `lib/ai/student-context.ts`.
- Existing query/actions/auth layers handle all user operations. No new privileged
  database client, provider, package, queue, email or scheduled job is added.
- Uses the existing `ANTHROPIC_API_KEY`, model and SDK, with structured-output and
  citation validation. Model instructions prohibit invented experiences, essay
  prose, unsupported admissions predictions and source-text instructions.
- [Essay planning assistance](ESSAY_AI_CONTEXT.md) uses this same student evidence catalog for story-to-prompt suggestions and connected outlines. [Saved-version essay coaching](ESSAY_COACHING.md) adds explicit version/context selection and reviewed feedback publication through the existing thread and revision-task controls. Planning assistance shipped in [PR #71](https://github.com/studyworksprep/counselworks/pull/71); coaching and migration 68 shipped in [PR #75](https://github.com/studyworksprep/counselworks/pull/75) on November 19, 2026. See the linked feature release records for completed rollout and verification.

## Verification

Unit tests cover context selection, limits, source stamps, questionnaire boundaries,
citations, authorization and source withdrawal during generation. The transactional
SQL suite covers direct row access, spoofed actors, cross-firm/parent isolation,
assignment removal, draft promotion, optimistic strategy append, cached skipped
questions, and quota enforcement after sources become unavailable.

`student-ai.spec.ts` drives real local app actions and database records through
Clerk development sessions for counselor, student and both parents. A loopback HTTP
fixture responds at the Anthropic SDK boundary, exercising request payloads,
structured parsing, failure recovery and in-flight withdrawal deterministically.
This verifies integration behavior, not the quality or availability of the live
model. Test records are removed; existing Clerk test identities are reused.

The separate [November 20 live-model quality review](AI_QUALITY_REVIEW_2026-11-20.md)
uses only fictional cases. It records semantic failures that valid citations and
structured output did not catch, plus proposed prompt improvements. Private review,
student confirmation and independent sharing remain necessary.

The [conversational interview](STUDENT_INTERVIEW.md) works without generated questions. This redesign preserves the existing assistance workflow; it adds no new AI guidance feature.
