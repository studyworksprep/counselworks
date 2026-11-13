# College prompt library

Updated November 13, 2026. The connected workspace (00047–00050) is live.
Annual maintenance requires migrations 00054–00055 before its app release; see
the acceptance record below. Existing lists are not bulk-backfilled; counselors
can explicitly assign required responses from a college workspace.

Counselors open **Essays → College Library** to search by college and entry
year, inspect summaries and follow official sources. The firm-specific Prompt
Bank remains available for manually curated assignments.

Adding a college through the college-list or application flow creates shared
essay drafts and first versions atomically. Assignment matches Scorecard/IPEDS
ID and the student's graduation year, treated as college entry year. Gap-year
applicants need counselor review. Only required prompts in verified sets are
assigned. No older year is substituted. Missing coverage does not imply that
no supplement is required. Optional and conditional prompts need review and an explicit counselor assignment.
Verified program-specific responses in a `no_supplement` set are also explicitly
assignable; that coverage never creates universal automatic assignments.
Starting an application also reconciles its verified required responses. Assignments
created by 00050 capture source, entry year, requirement, and limit metadata;
character-limited responses show a separate counter in both writing editors.

Re-adding a college relinks existing drafts without replacing writing,
versions, status or sharing choices. A later application links to those drafts.
Students see these assignments in their essay editor; parents do not see their
student-scoped contents unless staff change sharing. No notifications are sent.

## Initial content

The collection covers all **21 requested fall-2027 colleges**, with **47 prompt
summaries** after the November 13 evidence update. Fifteen sets have verified
content; Miami explicitly requires no general supplemental essay; five sets
remain under review pending current application access. Verified required
responses automatically create drafts. Optional and conditional responses are
visible for counselor review and do not automatically create drafts.

| College | Coverage | Automatic drafts | Notes |
| --- | --- | ---: | --- |
| Harvard | Verified | 5 | Required short responses |
| Yale | Verified | 1 | Other questions depend on application route |
| Georgetown | Verified | 4 | One slot uses the intended-school question |
| Boston College | Verified | 0 | Common App/QuestBridge and engineering conditions |
| SMU | Needs review | 0 | Public page does not establish current supplemental questions |
| Princeton | Verified | 6 | One academic slot with degree-specific alternatives; graded paper separate |
| Carnegie Mellon | Needs review | 0 | Three preliminary summaries; public page still references fall 2026 |
| Columbia | Verified | 6 | One list and five short answers |
| Wake Forest | Verified | 1 | Why Wake required; one optional response choice |
| Notre Dame | Verified | 0 | Common App/Coalition response plus two selected responses; route confirmation needed |
| Villanova | Verified | 1 | Choose one response |
| American | Verified | 0 | Optional response |
| William & Mary | Needs review | 0 | Two optional essays mentioned; wording and limits not publicly verified |
| Indiana Bloomington | Verified | 0 | Apply IU essay is conditional; Common App uses its personal essay |
| Santa Clara | Verified | 0 | Optional response |
| Florida | Needs review | 0 | UF short answers and Honors wording must be checked in the application |
| Miami | No general supplement | 0 | Personal statement and specialized-program materials still apply |
| South Carolina | Needs review | 0 | Application-route, Honors and scholarship questions need confirmation |
| UT Austin | Verified | 2 | Optional circumstances response; program-specific writing may apply |
| UVA | Verified | 0 | Nursing only, 300-word maximum; about 250 words suggested; no universal extra assignment |
| Washington & Lee | Verified | 0 | Two optional slots; separate conditional Johnson Scholarship essay |

Each record contains its official source URL, verification date (when verified),
word/character limits and applicability notes. Records checked but unresolved
include the check date in their notes. Required drafts total 26 across the eight
colleges with universal required responses. A college appearing in the library
does not imply that all specialized-program or scholarship writing is covered.

This is an initial collection, **not complete college-catalog coverage or a
verbatim prompt database**. Summaries are clearly labeled and link to official
wording. There is no annual crawler or automatic refresh.

## Maintenance

Open **Essays → College Library → Review and update annual prompts**.

1. Search by school and filter by entry year or due/unverified status. Choose the
   college entry year on the school card and start a review. An existing draft
   for that school/year is reopened instead of duplicated.
2. Review drafts begin `needs_review`, with no inherited verification date,
   next-review date, or private evidence. This applies to same-year revisions and
   next-year copies. Check the actual current application before changing coverage.
3. Staff editors (counselors, essay coaches, tutors, owners and admins) can edit
   responses, requirement flags, summaries/wording, word and character maxima,
   official source, public guidance, check date, next-review date and private evidence.
   Keep applicability and any choice instructions in the response text. Drafts
   are invisible to students and parents. Read-only staff can inspect the queue.
4. Save before publishing. An owner/admin reviews the saved entry and explicitly
   confirms the source, entry year, conditions and limits. Publication requires a
   source check in the last 365 days (never in the future), a future review date,
   private evidence and consistent coverage. Unknown requirements can be published
   as `needs_review` to suspend automatic assignments for that firm/year.
5. A firm's publication replaces its own current revision. Other firms retain
   their requirements. Published rows/responses/evidence are immutable for app
   users; the queue retains each prior publication with its publication date.

The global catalog remains read-only to tenant users. Shared updates still ship
as reviewed migrations; there is no privileged browser writer or new service-role
client. Firm edits use the existing caller-scoped database client, invoker RPCs,
central authorization and RLS. Private review evidence is stored in its own
staff-only tenant table so portal users cannot retrieve it through the database
API either. Stale saves/publications fail rather than overwrite another editor.

An explicit next-review date drives the due filter. Older shared records without
one are due one calendar year after their check date; unverified records are
always due. There is no automatic web crawler, annual publication, notification
job or carry-forward verification. No older entry year is substituted.

Stable question identity is preserved when editing or copying responses. New
responses receive new identities. Across revisions, assignment deduplication
uses `(scorecard_id, entry_year, prompt_key)` within the student/firm. Migration
00054 backfills only this linkage metadata for already linked library drafts.
It does not rewrite writing, limits, source snapshots, versions, status or audience.
The workspace links a revised response to the original draft and explains that
it retains its original requirements. Staff must review a substantive change
with the student; publication never silently changes an active writing assignment.
Do not remove/re-add the same response to force a new assignment identity.

Exact prompts can be imported from user-provided or appropriately licensed
material with `text_kind = 'verbatim'`. Summaries remain clearly labeled.

Represent choice groups as a response slot, not an assignment per alternative.
Distinguish required, optional and conditional questions. Preserve application
route and program restrictions. Keep character limits separate from words;
state approximate targets and line/page limits in text rather than inventing
hard maxima. Every verified set needs an official source and verification date.

## Verification

The prompt-library SQL suite covers required-only assignment, year matching,
unverified exclusion, first versions, duplicate prevention, re-add preservation,
application linking, the requested 21-college collection, real
Princeton/Columbia/Wake assignment counts, conditional-route exclusion,
cross-firm rejection, catalog write denial, portal audience filters, and rollback
on version failure. Both library and connected-workspace suites are wired into
CI. The November 12 acceptance record below includes live counselor, student and
parent browser checks against the production build.

## Common App verification — October 26, 2026

The disposable student account was used to inspect the live fall-2027 forms.
The UVA finding is incorporated in migration 00055. South Carolina remains
under review because the separate Honors questions are still unavailable.

- **UVA:** [Academics](https://apply.commonapp.org/mycolleges/354/2786/8113)
  reveals one required Nursing response after selecting School of Nursing:
  summarize a health-care experience or significant interaction that strengthened
  interest in nursing. Instructions suggest about 250 words; the editor explicitly
  accepts 1–300 words. The other four school/program choices (Arts and Sciences,
  Engineering, Architecture, Kinesiology) did not reveal an essay in Academics.
  The main Common App personal essay is required. CEA's nursing wording differs
  from the live form; use the live form as the authority. Treat the nursing slot
  as conditional, with a 300-word maximum and 250-word suggested target.
- **South Carolina Columbia:** [College information](https://apply.commonapp.org/mycolleges/1010/about)
  requires the Common App personal essay. Inspected General, Academics,
  Additional Education, Contacts, Community Standards and Application
  Certifications; no universal additional essay appeared in those sections.
  This does not claim coverage of every major-specific or disclosure branch.
  [Academics](https://apply.commonapp.org/mycolleges/1010/5387/20353) states that
  the Honors application becomes available in the USC Admissions Portal within
  48 hours after submitting the general application. Selecting Honors interest
  confirmed a November 15 deadline and did not reveal essay prompts in Common
  App. Honors/Top Scholars wording and limits therefore remain unverified.

Added both colleges, selected South Carolina Fall 2027 and Honors interest,
and left UVA on School of Nursing. No essays were entered, certifications signed,
or applications submitted. Accessing the gated USC Honors form would require a
separate existing admissions-portal session or source material from that form.


## Connected college workspace — November 12, 2026

Each list entry now has one connected view:

- Counselor: `/students/[studentId]/colleges/[studentCollegeId]`
- Student: `/student-colleges/[studentCollegeId]`
- Parent: `/family-colleges/[studentCollegeId]`

College names in staff planning, the student's list/dashboard, and family lists
and applications lead into this view. Application details and essay editors link
back. Application-linked tasks use the same destination in the portals.

The workspace shows the application round, deadline and its source, the existing
requirements checklist, current-year library coverage, assigned essay status,
linked tasks, and visits/interviews. Writing progress is derived from the same
essay records used by the editors. Checklist completion remains an explicit
counselor verification; approved writing alone does not establish that every
route-specific requirement is complete.

### Audiences

Counselors with student access can start an application, refresh required prompt
assignments for an older list, and explicitly assign reviewed optional or
conditional responses. Read-only staff do not receive those controls. The
existing application, task, essay, and engagement editors remain the write paths.

Students see their own visible drafts and tasks. Parents see their household's
applications, public school requirements, family-visible tasks, and only essays
whose audience staff explicitly set to family/firm. Student-private essay counts,
review states, titles and bodies are not queried for parents. A public catalog
prompt title is school information, not disclosure that a student has written it.
`/family-essays/[id]` is read-only and checks both household membership and the
family/firm audience. Private counselor feedback is never fetched there. The same
read-only destination is available from a family-shared essay's task reference.
Visit types/dates retain the prior portal behavior; staff engagement notes remain
staff-only in this view.

All fetch-by-id routes check the actor's firm and student/household relationship.
Portal queries use explicit field and audience projections even in the local
service-client fallback. The browser checks include another child in the same
firm, as well as private student/staff resources. SQL checks cover separate firms,
forged actors, and portal RPC mutation denial.

### Assignment and application integrity

Migration 00050 adds an invoker RPC for prompt assignment and two invoker RPCs for
application creation. List/app creation and initial drafts/versions commit or roll
back together. Locks and the unique application index prevent competing starts
from duplicating an application. Repeated starts return the existing application
without resetting its round, explicit deadline, status, or writing. Repeated
assignment changes links only, preserving draft text, source snapshots, versions,
review state, and audience. Catalog edits do not rewrite an assigned snapshot.

Required prompts are the only automatic assignments. Optional/conditional
assignment is deliberately manual. Wrong-year, missing, unverified and explicit
no-supplement coverage remain distinct. This release does not expand the 21-school
content collection or claim verification of the six unresolved sets above.

Before production migration, inspect legacy application duplicates:

```sql
select firm_id, student_college_id, count(*)
from applications
group by firm_id, student_college_id
having count(*) > 1;
```

Resolve any real duplicates deliberately before applying the unique index; this
migration never deletes existing applications. No production backfill, migration,
deployment, or data change was performed in this implementation session.

### Acceptance record

The local Supabase review database was upgraded from 00046 through 00050 without
resetting its preserved fictional identities. A separate disposable database was
built from all 50 migrations and seed fixtures. The prompt-library, connected
workspace, RLS isolation, task-deliverable, workflow-plan, and task-notification SQL
suites pass. Twelve parallel application starts produce one list entry, one
application, one draft and one initial version.

The production webpack build, type-check, zero-warning lint, and all **315 unit
tests** pass. The final complete configured browser suite is **56 passed,
3 Stripe skips, zero failures or unreached tests** on the rebuilt production app.
All four dedicated connected-workspace browser journeys pass,
including counselor assignment/application creation, student save/review,
explicit family sharing, parent read-only access, household isolation, mobile
overflow, and scoped accessibility checks. The extended golden path passes
**20 checks**, including library year exclusion, application creation, essay
review/finalization, decisions, history anonymity, and route isolation; its two
Stripe payment checks skip because test Stripe credentials are absent.

The preserved review database required fixing older acceptance assumptions:
search imported households/tasks rather than assuming the first page, use Agenda
when busy calendar days collapse events, calculate fixture counts from the live
baseline, and test both sides of the historical-outcome privacy threshold. Task
scope navigation and keyboard activation now wait for their actual targets;
Clerk's observed read-only navigation interruption is retried without replaying
any write. No behavior assertion was skipped to accommodate these conditions.

Production-build regression also exposed a cached prefetch redirect during a
Clerk session refresh. The new college/writing links fetch on navigation rather
than prefetching permission-sensitive destinations, and the golden path asserts
the exact return URL. Unread-message and notification badges use a darker danger
color to meet text-contrast requirements when counts are populated.

Local security-advisor checks found four existing function-search-path warnings
on older functions and none on the new workspace functions. The three new RPCs
use invoker security, fix their search path, and deny anonymous execution.
Production migration/deployment, real email delivery, document AI processing,
and Stripe onboarding/payments were not verified by this local acceptance run.
The disposable SQL verification database and owned local test servers were
removed/stopped after acceptance; the existing local Supabase stack and its
preserved fictional review identities remain available.

## Annual maintenance and remaining evidence — November 13, 2026

Migration 00054 introduces firm-owned draft/published/archived revisions, private
review evidence, publication checks, optimistic concurrency and stable logical
assignment identity. Migration 00055 incorporates available evidence without
promoting inaccessible questions. The current result is **15 verified schools,
1 explicit no-general-supplement school, 5 awaiting verification, 47 summaries**.
The number of universally required automatic responses remains 26; UVA Nursing
is conditional and never automatically assigned.

| School reviewed | Result | Evidence and remaining work |
| --- | --- | --- |
| UVA | Verified, scoped to inspected fall-2027 Common App | [Official Academics form](https://apply.commonapp.org/mycolleges/354/2786/8113), inspected October 26; Nursing conditional response, suggested 250/hard maximum 300; other four listed schools/programs had no Academics essay. Other specialized/disclosure/scholarship routes remain individual checks. |
| Carnegie Mellon | Awaiting fall-2027 form confirmation | [Official essay guidance](https://www.cmu.edu/admission/admission/admission-consideration) and [application requirements](https://www.cmu.edu/admission/admission/undergraduate-admission-requirements) rechecked November 13: three 300-word responses published. The consideration page still labels testing fall 2026; the current form has not been inspected, so the preliminary summaries stay blocked from assignment. |
| SMU | Awaiting current question set | [Official first-year process](https://www.smu.edu/admission/apply/undergraduate-admission/process) has current deadlines but no complete supplement text/limits. [Hunt scholarship instructions](https://www.smu.edu/studentaffairs/hunt-scholars/prospective-students/apply) establish separate essay/video materials; this does not resolve general Common App writing. |
| William & Mary | Awaiting choice wording and limits | [Official checklist](https://www.wm.edu/admission/undergraduateadmission/how-to-apply/first-year-applicants/application-checklist/) encourages up to two optional essays, but does not publish the current choice list and limits. |
| Florida | Awaiting short answers and applicable program branches | [Official freshman instructions](https://admissions.ufl.edu/apply/freshman/), [Honors admissions](https://honors.ufl.edu/admissions/first-year-honors-student-admissions/) and [Innovation Academy](https://catalog.ufl.edu/UGRD/academic-programs/innovation-academy/) confirm additional/conditional writing, but do not establish the full current text/limits. |
| South Carolina | General Common App route inspected; Honors still gated | October 26 Common App inspection is recorded above. [Current official Honors instructions](https://sc.edu/about/offices_and_divisions/undergraduate_admissions/honors_and_scholars_programs/apply/) confirm two additional essays in a separate portal. An existing portal session or current source material is needed to check their wording/limits. Never submit an application simply to unlock it. |

No current Common App or USC admissions session was available in Chrome during
this maintenance work. Access was requested while implementation continued.
These five sets are deliberately **not claimed complete**. Public source-check
dates are recorded separately from the coverage decision: a recent check date
on a `needs_review` record does not authorize automatic assignments.

Local acceptance: type-check, zero-warning lint, 416 unit tests and production
webpack build pass. All 11 combined connected-workspace/annual-review browser
checks pass across owner, counselor, student and parent, including narrow-screen
layout and accessibility. Database suites cover migration compatibility,
firm/role isolation, source snapshots, draft privacy, direct API protection for
review evidence, publication validation, stale-editor rejection, annual rollover
and assignment deduplication. Twelve parallel application starts still create
one application, one draft and one initial version. Full release verification
and deployment status are recorded separately below.

Production-build acceptance is complete: all seven annual-review journeys and
all 20 golden-path checks pass. Two Stripe checks skip locally because Stripe
test credentials are absent. The broader initial run exposed the already
documented missing local `INNGEST_DEV=1` setting; restarting the same production
build with that setting allowed upload and every downstream check to pass.
The SQL maintenance suite additionally checks fresh assignment from a firm's
publication and a second publication archiving its predecessor without changing
assignments from either prior source.

### Final review-ready record

The final production build passes **12 targeted role journeys** (four connected
college-workspace checks and eight annual-maintenance checks) plus **20 golden
path checks**. Two local Stripe checks skip for missing test credentials.
Type-check, zero-warning lint, 416 unit tests, migration/regression SQL and the
12-request application race pass. The added no-general-supplement case verifies
that conditional responses remain explicitly assignable without universal auto
assignments. The preserved roster regression searches a run-unique last name
and explicitly searches for the unassigned fixture student, avoiding pagination
assumptions while retaining the negative access assertion. Assignment checks
assert the resulting draft link rather than a transient success notice.

[PR #56](https://github.com/studyworksprep/counselworks/pull/56) contains the
review-ready changes. **Production rollout is blocked pending explicit approval.**
Automatic approval review rejected the production migration because it changes
schema, RLS/publishing permissions and assignment matching without specific
release authorization. No workaround was attempted. A read-only check confirms
that 00054 is absent and production still has 21 sets, 46 prompts, two essays and
two versions. Do not merge before approved migrations 00054–00055 are installed.
The five unresolved schools still need current Common App/USC Honors evidence;
this release does not claim all six verifications are complete.
