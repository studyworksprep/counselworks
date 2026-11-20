# Conversational student interview, stories and narratives

The interview takes one question at a time through **priorities**, **experiences** and **review together**. It works without generated questions. Existing optional AI assistance is retained; new AI guidance development is paused while this feature is completed.

Students start with a short introduction, confirm known identity/school details, and explore short topics. Single/multiple choices, ranked priorities and a concrete tradeoff reduce writing; short notes remain for memories, personal reflection and story discovery. Every original category and all 58 original question identifiers remain available. The new flow adds 14 direct preference/scenario/follow-up questions. Topics and question navigation are collapsed until needed; nobody needs to read the questionnaire first.

Back, save, save-and-continue and save-and-exit have explicit pending/error states. Unsaved changes block topic/stage/view navigation and browser unload. Failed/stale saves retain inputs. The device retains only an account/student-scoped question identifier, never answer text. Returning on that device resumes that question. Without a saved cursor, the first unvisited question is offered; saved answers are available on every device. Revisiting an answer and changing its audience increments its revision.

## Responses and sharing

Before responding, students see the current audience and two independent controls:

- **Allow my parents or guardians to see this response**: checked for a new student response.
- **I’d like to discuss this further with my counselor**: unchecked for a new response.

Changing the discussion flag never changes audience or turns an answer into an incomplete state. The counselor summary links requests to the exact response. A counselor can start one discussion follow-up per response; the existing reply/close/reopen workflow tracks its status separately. The database prevents duplicate discussion follow-ups, including simultaneous creation. Ordinary counselor follow-ups remain independent.

**Come back to this** records `deferred`. A discreet decline action records `declined`; `unsure` records uncertainty. Missing rows are unanswered. Flexible choices are explicit answers, with no ranking weight. These states never become inferred preferences. New v2 responses cannot use the old `skip`/`discuss` answer states.

Migration 00065 performs **no answer or audience backfill**. Existing v1 answers retain text, audience, state and context boundaries. Their original prompts remain available. The historical editor can save them as v1; **Review and use the new format** explicitly converts them. No options are guessed from writing. Conversion retains the current audience and requires a revision check. Like any deliberate answer edit, it replaces the current response; protected story snapshots remain unchanged.

Parent interviews use the same presentation with eight separate written prompts. New parent answers remain private to that parent and the counseling team unless that parent widens sharing. Two parents never edit each other's answers. Parent observations are clearly attributed and never affect student rankings.

Stories, narratives, strategy sections, plans and essays keep their independent consent/review controls. Sharing a response never publishes a derived item. Withdrawing response access invalidates dependent source access under the existing revision/permission rules. Shared story text does not expose its protected original snapshot.

## Versioned structured answers and provenance

`web/src/lib/interview/definitions-v2.json` is the released v2 student definition manifest. Stable question keys, stable option IDs, format, stage/topic, source reference, optional criterion and optional branch condition live together. `template.ts` retains v1 student prompts and parent definitions. `interview_question_definitions` stores the released definitions in the database; authenticated users can only read them. Meaning/wording changes require a new definition version rather than editing released definitions.

V2 rows store `template_version=2` and `structured_response={version:2, optionIds:[], text:"", importance:"preference"|"important"|"requirement"}`. `discussion_requested` is independent. Existing `answer` is a readable, database-validated representation for stories, strategy references, essay planning and shared AI context. References continue to use answer ID and revision; fit explanations additionally retain question key and definition version. Invalid options, duplicate IDs, contradictory open choices, invalid formats and old alternative discussion states are rejected in actions and database guards.

Predictable branches:

| Trigger | Follow-up |
| --- | --- |
| A3: `focused` | FIT_PROGRAM_DETAIL |
| P3: any concrete support option | FIT_SUPPORT_DETAIL |
| J2: any practical requirement | FIT_REQUIREMENT_DETAIL |
| P2: `compare` or `depends` | FIT_TRADEOFF_DETAIL |

An earlier follow-up stays readable/editable in review if the trigger changes. It does not affect current matching/context while inactive. Deferred/declined and legacy skipped/discussion topics stay out of AI sources and suggested questionnaire topics. An answered preference with the **new** discussion checkbox remains available under its existing source permissions.

## College matching and data gaps

Read-only production audit on November 17, 2026: all 250 catalog rows have size, normalized setting and institution type; only 25 have a state. State comparisons therefore remain unknown for the other 225; this migration does not invent or backfill locations. Local seed rows do not have the same coverage, so browser fixtures provide explicit college attributes.

The actual catalog stores Scorecard `undergraduate_size`, normalized `locale_type` (City/Suburb/Town/Rural), state and ownership type. `getCollegeRecommendations` now uses authorized current **student** responses and `scoreCollegeWithInterview`; it never writes interview values into manually maintained profiles.

| Question / options | College field and rule | Ranking effect |
| --- | --- | --- |
| FIT_SIZE: `small`, `medium`, `large` | `undergraduate_size`: <5,000; 5,000–15,000; >15,000 | Direct comparison |
| FIT_SETTING: `city`, `suburb`, `town`, `rural` | Exact normalized `locale_type` | Direct comparison |
| FIT_STATES: two-letter state IDs, including DC | `state_region` | Direct comparison |
| FIT_TYPE: `public`, `private` | Public / Private nonprofit `institution_type` | Direct comparison |
| P1 ranked option IDs | Ordered priorities in counseling summary | No unsupported weighting inferred |
| FIT_DISTANCE; FIT_FRIDAY; FIT_COMMUNITY; FIT_LEARNING; FIT_ACTIVITIES | Travel, social life, belonging, teaching and activities need research | No ranking effect |
| FIT_AID; P3; A3; J2; P2 and their short follow-ups | Costs/aid, services, programs, practical limits and tradeoffs need direct verification | No ranking effect |

For a supported direct preference, an available matching attribute adds 8 points for a flexible preference, 14 for important, or 20 for a requirement; a mismatch subtracts the same amount. Multi-select means any selected option can match. An explicit no-preference choice adds no weight. Unknown attributes add/subtract nothing and requirements remain unverified. Known requirement mismatches are listed after other candidates, with explicit explanations; they are not silently hidden. Existing academic, graduation and ranking signals remain, and average net price is labeled as an aggregate rather than a personal aid offer.

An answered interview state/type choice supplies that criterion during scoring so it is not counted twice with the old profile. A disjoint manual profile value is flagged for confirmation, and the profile is unchanged. Uncertain/deferred/declined choices supply no preference. Scenarios do not imply personality, campus setting or a firm requirement. The counselor summary exposes priorities, requirements, flexibility, uncertainty, separate parent observations and research gaps. Parent-facing summaries receive only their currently authorized sources; the full ranking interface remains staff-only.

## Authorization and verification

Assignment, firm, student ownership and household checks remain in shared authorization helpers. Existing RLS applies to the added answer/follow-up columns. New global definition rows are read-only to authenticated users and unavailable to anonymous users. No new privileged client, model provider, package, queue or email is added.

The conversational interview is deployed, with production migration **00065_conversational_interview.sql** applied. Shared-context essay planning and saved-version coaching subsequently shipped in [PR #71](https://github.com/studyworksprep/counselworks/pull/71) and [PR #75](https://github.com/studyworksprep/counselworks/pull/75). Verification covers a fresh complete migration/seed run; existing isolation/downstream SQL suites; the new `supabase/tests/conversational-interview.sql`; pure validation/branching/matching tests; and real student, assigned counselor and two-parent browser journeys with saved records, privacy withdrawal, legacy editing, stale saves, mobile layout and accessibility checks. The optional AI contract-fixture suite checks compatibility with existing assistance, not live model quality.
