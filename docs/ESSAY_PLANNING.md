# Essay planning board

The board connects current college requirements, assigned essay drafts, and the existing story/narrative bank. Counselors open **Essay planning board** from a student's essays, college workspace or interview bank. Students use **My essays → Essay planning board**. Parents open **Essay planning** and select their child. Individual essays link back to their board card.

## Working through an application

1. Review the college's published requirements for the student's entry year, application round and deadline. Missing or unverified coverage is explicit; it never means there are no required responses. Required responses missing assignments are highlighted for counselors and students. Counselors can assign individual required, optional or conditional responses using the existing prompt assignment flow.
2. Give each assigned response an approach and angle. Experience responses connect stories or narratives; research/college-fit responses may use an angle without a personal story. Existing writing, assigned prompts/limits, versions and essay status remain separate from planning.
3. Choose existing stories and narratives. These are the same canonical connections used by the bank and essay detail page. Narratives count their supporting stories when checking reuse; connecting the same story directly and through a narrative counts each essay once.
4. Review gaps and same-college overlap. The material bank lists each visible essay using a story or narrative, including general essays and reuse across colleges. Across-college reuse is information, while repeated underlying stories within one college invite a closer look. Search and filters isolate gaps, review needs, overlap or reviewed plans.
5. Students review the angle and material. Only they can confirm a plan or approve parent access to its note/approach. Experience responses require connected, student-confirmed material before confirmation. A research plan can be confirmed without a personal story. Plan review does not approve the essay draft.
6. Open the existing essay editor to write, submit and revise. The board shows writing status, word/character counts, assigned limits and saved version. Revised prompt publications display the current requirement beside the preserved assignment rather than replacing writing or duplicating response slots.

## Audiences and changes

Plan drafts are deliberately visible to the student and assigned counseling team. Counselors retain their separate private working-notes section in the strategy brief. Parents read only essays shared with family, confirmed family-shared material, and planning notes explicitly approved by the student. The essay and every connected story/narrative must independently permit family access before a note can be shared. Sharing a plan never changes source audiences or exposes original interview snapshots.

The parent board is explicitly a partial view: counts, links and reuse are calculated from material visible to that parent. It does not reveal hidden assignment, story, note or review counts. Parents cannot edit plans, connect material, assign responses or approve consent for students. Both guardians have the same family audience.

Counselor revisions reset confirmation and parent note access. Changes to canonical connections do the same, including connections added from the bank. Changed source revisions pause access until the student reviews the current plan again; private/withdrawn supporting stories also hide related narratives and notes. Independently shared material remains readable under its own audience. Simultaneous edits reject stale saves and retain unsaved text. Saves also check the source revisions displayed in the open editor, preventing approval of unseen changes. Changed modal forms require an explicit discard, and a failed plan save rolls back connection changes too.

## Implementation and release

Migration **00059_essay_planning_board.sql** adds `student_essay_plans` with tenant-scoped RLS, invoker functions, fixed search paths, revision checks and student-only consent guards. It extends the existing canonical `student_story_essay_links` to narratives and guards both insertion and removal. `save_essay_plan` locks the essay, verifies the prior plan and link set, updates connections and saves a revision atomically. Reference metadata stores only IDs and revisions. Queries/actions repeat role, assignment, tenant and audience checks independently of database RLS, including the local service-role fallback.

No new service-role call sites, environment variables, external models, jobs, emails or data backfills are introduced. Apply the reviewed migration before deploying the board's application code. Implementation and production rollout are separate.

Acceptance includes pure prompt-matching, gap/reuse and source-consent tests; actual database-role isolation, student/parent authorization, source changes, atomic rollback and concurrent-save checks; and real counselor/student/two-parent browser journeys through assignment, planning, writing, consent, revision and bank connections. The browser suite also checks mobile overflow and accessibility. Golden-path step 12a covers the connected flow without changing essay finalization.

Local validation: 459 unit tests across 50 files, zero-warning lint, type-check and production webpack build pass. All 59 migrations plus seed/repeated isolation fixtures apply from a fresh database; all 12 CI SQL suites and four concurrency suites pass. Security advisors report the same four pre-existing function warnings, with no findings for the new planning objects. Final browser and hosted CI results are recorded in the pull request.
