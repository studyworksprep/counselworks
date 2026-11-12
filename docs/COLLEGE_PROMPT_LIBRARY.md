# College prompt library

Updated November 12, 2026. Apply migrations 00047 through 00050 before deploying
the app. Production has not been changed. Existing lists are not bulk-backfilled;
counselors can explicitly assign required responses from a college workspace.

Counselors open **Essays → College Library** to search by college and entry
year, inspect summaries and follow official sources. The firm-specific Prompt
Bank remains available for manually curated assignments.

Adding a college through the college-list or application flow creates shared
essay drafts and first versions atomically. Assignment matches Scorecard/IPEDS
ID and the student's graduation year, treated as college entry year. Gap-year
applicants need counselor review. Only required prompts in verified sets are
assigned. No older year is substituted. Missing coverage does not imply that
no supplement is required. Optional and conditional prompts need review and an explicit counselor assignment.
Starting an application also reconciles its verified required responses. Assignments
created by 00050 capture source, entry year, requirement, and limit metadata;
character-limited responses show a separate counter in both writing editors.

Re-adding a college relinks existing drafts without replacing writing,
versions, status or sharing choices. A later application links to those drafts.
Students see these assignments in their essay editor; parents do not see their
student-scoped contents unless staff change sharing. No notifications are sent.

## Initial content

The collection covers all **21 requested fall-2027 colleges**, with **46 prompt
summaries**. Fourteen sets have verified content; Miami explicitly requires no
general supplemental essay; six sets remain under review. Verified required
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
| UVA | Needs review | 0 | Current complete set, including nursing conditions, not publicly verified |
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

Publish reviewed data migrations. Global catalog tables are read-only for
tenant users. Never add a privileged browser writer. Exact prompts can be
imported from user-provided or appropriately licensed datasets with
`text_kind = 'verbatim'`.

Use stable `(scorecard_id, entry_year)` and `(prompt_set_id, prompt_key)` keys.
Create a new set for each year. Keep uncertain sets `needs_review`. Verify
absence explicitly before using `no_supplement`. Do not delete source prompts
referenced by student drafts or overwrite their snapshots.

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
These findings are research evidence; they have not yet been incorporated into
a follow-up catalog migration.

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
