# Counselor strategy brief

The **Strategy brief** view sits inside the existing Interview & Stories workspace for counselors, students and parents. Direct links use `?view=strategy` on the existing interview routes. It connects counselor-written synthesis to interview answers and story/narrative entries; it does not generate claims or copy writing automatically.

## Counseling flow

1. Start a counselor-only draft in priorities and direction, requirements and support, strengths and experiences, possible narrative threads, student/parent perspectives, or questions and next steps. A seventh section holds permanently private counselor working notes.
2. Select up to 20 supporting interview answers, stories or narratives. The source picker identifies each respondent. Source buttons return to the exact response or story in the same workspace.
3. Review the prose, then explicitly share each section with the student. A section linked to a private parent response cannot be shared with the student. Counselors must also check their own synthesis for private information before sharing.
4. The student can mark a shared section accurate, request a discussion/correction, or keep reviewing, and leave a review note. They cannot rewrite the counselor's text.
5. Only the student can approve parent access, separately for each section. Approval shares that section **and the student's review note** together. Every linked response must already be family-shared; linked stories and narratives must also be student-confirmed, with accessible supporting stories. Sharing a brief never changes the sources' own permissions.
6. Parents read only currently approved sections and their accessible sources. They cannot edit the brief, approve it for the student, or read counselor drafts/private notes. Both guardians in the household have the same family audience.

Counselor saves reset student confirmation and parent access, preserving earlier student feedback for the next conversation. Linked-source revisions pause parent access until the counselor refreshes the links and the student reviews again. Students retain discussion context when a source changes, but a section linked to a withdrawn private parent response is hidden from the student as well. Drafting or reviewing the brief does not overwrite interviews, story source snapshots, profile fields, essays or applications.

Unsaved student reviews block view changes; failed/stale saves retain text. Counselor editors retain failed edits and require an explicit discard before closing changed forms. Concurrent writers use revisions rather than silently replacing one another.

## Authorization and implementation

Migration **00058_counselor_strategy_brief.sql** adds `student_strategy_sections`, indexed by the unique firm/student/section key. All content in a row, including review notes, has the same declared audience. The migration enables RLS, revokes anonymous grants, and uses fixed-search-path invoker functions. Mutation guards protect author/tenant/student identity, counselor-only synthesis, student-only consent, source identity/version/access, private notes and revision checks. Read-only staff can read but cannot change sections; scoped staff must be assigned to the student.

References store only source kind, ID and revision. Original response snapshots remain in the existing protected story-source table. RLS checks source visibility dynamically; the query layer independently repeats portal filtering, including in the local service-role fallback. Student actions independently verify the published section and source consent. No service-role call sites, external model calls, jobs, email notifications, environment variables or automatic record backfills are added.

Apply the reviewed migration before deploying code that reads these sections. This implementation does not itself apply production changes.

## Acceptance

`supabase/tests/strategy-brief.sql` exercises actual authenticated database roles, draft publication, permanently private notes, private parent evidence, student consent, both parents, feedback retention, stale revisions, changed/withdrawn sources, anonymous access, read-only and unassigned staff, and cross-firm access. Pure filtering tests independently protect the application's service-role fallback. The extended interview browser suite exercises the counselor → student → two-parent journey, evidence navigation, invalid publication, simultaneous edits, feedback, withdrawal, and mobile accessibility. Golden-path step 10c carries the integrated brief-sharing flow.
