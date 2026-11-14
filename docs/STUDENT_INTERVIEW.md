# Student interview, stories and narratives

The onboarding interview uses the firm's [Getting to Know You questionnaire](https://docs.google.com/document/d/1XTxv8rKvCuUtlJCbT1TJHX7H8JqzlT-YndZZ3MWGSRY/edit). Version 1 preserves all 58 numbered questions, moves application framing into the final review, and adds ranked priorities, tradeoffs, learning/support preferences and counseling concerns. The source document is unchanged.

## The connected flow

1. **Priorities:** confirm known name/school/year, explore academic direction and college goals, record constraints and rank up to three priorities. Scores, activities and financial profile fields retain their existing editors; interview answers do not silently overwrite them.
2. **Experiences:** explore manageable sections of the questionnaire. Every question supports an answer, still exploring, prefer to skip, or discuss with the counselor. Responses save individually; changed responses must be saved before switching stages/sections.
3. **Review together:** revisit the student's saved words and priorities, clarify the desired application narrative and boundaries, review stories and supported narratives, and mark the stage reviewed. Review dates distinguish a prior review from subsequent changes. Stages can be revisited and do not require disclosing sensitive experiences.

Students reach the interview from their dashboard, profile or navigation. Staff use the student's **Interview & Stories** section. Parents use **Parent Interview**, choose a child, and answer an independent eight-question interview. Two parents never edit the same response row. The staff respondent selector keeps student and parent perspectives identifiable.

Counselors ask a general follow-up or attach one to a particular response. The selected student or parent replies; counselors can close/reopen questions. Follow-ups appear in the interview workspace. This release does not send email notifications.

## Stories, narratives and essays

A student answer can be captured as a story, retaining its original text at capture in separate protected storage. Only the student and counseling team can read that saved original; family sharing an edited story does not share its private source text. Later answer edits do not rewrite the snapshot. Parent responses cannot be promoted as if they were the student's voice. Students and authorized staff can also write stories directly.

Narratives are drafts of possible themes, with explicit supporting story links. Only the student can confirm a story or narrative. Confirming a narrative requires at least one confirmed supporting story. Editing a confirmed story asks for a fresh review of related confirmed narratives.

Stories can be linked/unlinked to accessible essays for the same student. Links track reuse and appear in the staff, student and family essay views. They neither copy writing nor change essay audience, status, limits, versions or application links. No AI generation or external model provider is used in this flow.

## Sharing and authorization

The connected [counselor strategy brief](STRATEGY_BRIEF.md) has a separate draft, student-review and student-approved parent-sharing flow. Brief references retain each interview/story source's permissions.

| Item | Initial audience | Who controls changes |
|---|---|---|
| Student response | Student and counseling team | Student |
| Parent response | Responding parent and counseling team | That parent |
| Follow-up | Selected recipient and counseling team | Recipient controls reply/sharing; staff close/reopen |
| Story/narrative | Student and counseling team | Student chooses family sharing and confirmation |
| Linked essay | Its existing essay audience | Existing essay permissions |

Owners/admins and authorized assigned staff can read interviews; read-only staff cannot edit. Unassigned scoped staff, unrelated families, other firms and anonymous users are denied. Parents see only explicitly family-shared student material and other parents' explicitly shared answers.

Family access to stories and narratives requires student confirmation of the current version. Staff edits return the item to a draft and hide the revision until the student confirms it again. Family access to a narrative also requires every supporting story to remain confirmed and family-shared. Withdrawing one story hides the narrative from family as well. Essay references require independent access to both the story and essay. App queries apply these filters explicitly, including when a local development instance uses the service-role fallback. RLS and mutation guards independently enforce the rules in production.

Sharing is per item: changing a response does not retroactively change a saved story or an already written essay. This is explained beside each response.

## Implementation and release

Migration **00057_student_interview_story_bank.sql** adds six tenant-scoped tables: answers, review checkpoints, story/narrative entries, protected original sources, follow-ups and essay links. New functions use fixed search paths and invoker permissions; anonymous grants are revoked. Source/author identity is immutable, answer/bank/follow-up writes carry optimistic revisions, and supporting stories/essays must belong to the same firm and student.

Live data access remains in `db/queries.ts` and `actions/interview.ts`; shared authorization is in `auth/interview.ts`. The versioned questionnaire is in `interview/template.ts`. There are no new service-role client call sites, background jobs or environment variables.

Apply the reviewed migration before deploying code that reads these tables. Production rollout is separate from local implementation and verification.

Verification includes template/consent unit checks, a clean migration/seed run, `supabase/tests/student-interview.sql` for direct database ownership/isolation/sharing, and `tests/e2e/student-interview.spec.ts` for the real counselor/student/two-parent flow and mobile accessibility.
