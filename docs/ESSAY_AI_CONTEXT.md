# Story-to-prompt suggestions and connected outlines

The **AI essay planning** control appears on assigned responses in the essay planning board and beside the connected writing workspace. Students and authorized, assigned counseling staff can request assistance. Parents read only the independently reviewed and family-shared response plans and outlines through the existing family pages.

1. Open **AI essay planning**, then **Review essay context**. Review the assigned prompt and limits, preview sources, and explicitly select what to send.
2. **Find story-to-prompt connections** compares selected confirmed stories/narratives with the prompt. Each possible angle explains its tentative fit, cites selected sources, and asks questions for the student. A truthful no-match response identifies missing evidence instead of inventing an experience.
3. **Review and edit before saving** opens one editable proposal at a time. Saving a story choice replaces the response angle and that essay's canonical material connections. The current plan is available for comparison; other essays and bank records are unchanged. All input sources remain attached, including selected context not cited by the model.
4. **Plan a connected outline** uses the saved angle and its confirmed connected material. The plan's cited context and linked entries are required, visible inputs. Sections contain purpose questions, planning notes and source citations. Review and edit them before replacing a working outline. The existing outline is available for comparison.
5. Saving either result creates a private draft for the student and counseling team. The student then uses the existing plan/outline review and parent-sharing controls separately. Nothing writes essay prose, a saved essay version, submission state or approval.

## Context and authorship

The source catalog uses the same student evidence and exact revision stamps as interview assistance: active answered/unsure student interview responses, confirmed stories/narratives (including confirmed narrative support), student-reviewed shared strategy sections with current supporting evidence, and the student's own follow-up replies. Parent interviews, counselor-private notes, raw story snapshots, skipped/inactive responses, unconfirmed bank material and unrelated profile fields are excluded. No essay body or version history is sent to these planning modes.

Only checked sources and assigned requirements are sent; outline mode also sends the displayed saved angle. There are at most 20 sources and 30,000 source characters, with no silent truncation. The established Anthropic provider, model and credentials are reused. Source and prompt text are untrusted evidence, never instructions. Structured results must cite exact selected source keys and real selected bank IDs; outlines may connect only material already in the plan. Unsupported IDs fail closed.

Guidance asks the student to choose facts, interpretation, structure and language. It prohibits ghostwritten hooks, thesis sentences, dialogue, first-person essay prose, invented experiences and unsupported college facts. The older counselor brainstorm/outline tools now request opening/purpose questions and planning instructions with the same authorship promise; their saved field names remain compatible.

## Access, freshness and sharing

Private requests belong to their requester; students and colleagues do not inherit one another's private suggestion history. Tenant, assignment, essay visibility and source authorization are checked before reserving quota, after the model call and again on acceptance. Request signatures cover assigned requirements, plan/outline revisions, connections and source versions. Acceptance is atomic, single-use and revision checked. Source withdrawal or concurrent changes suppress derived suggestions and preserve review edits on a refused save.

Accepted plans/outlines retain `ai_source_refs`. Their citation lists link to the authorized interview, bank, strategy or follow-up surface and display cited revisions. Parent access requires every AI input to remain current and independently family-eligible, in addition to existing essay, bank, plan and outline sharing gates. Withdrawing a source dynamically pauses derived parent access without rewriting the student's work or widening another audience. Withdrawal of student-visible strategy context also hides derived material from the student until access is restored or the counseling team replaces it with an eligible draft.

Changing a bank entry to needs-review pauses approval/sharing but keeps the student’s own working drafts visible. Actual withdrawal of source access (for example an unshared strategy section) still hides its derived material. Manual edits preserve citations. **Review updated cited context** shows the current sources; **Use reviewed source versions** updates the open form explicitly. No source is silently dropped. Unavailable context can remain in a private working draft, but cannot be confirmed or shared; the user can review the source with their counselor or generate a new proposal from eligible context. An outline must retain the response plan's cited inputs. Background refreshes do not replace an open editor's displayed revisions.

Interview and essay planning requests share the existing per-firm, per-user quota of 10 requests/hour and 40/day. A content-free usage ledger counts failures and requests hidden by source withdrawal. Provider calls have a 45-second timeout and no automatic retries. Errors and logs do not include prompts, student text or provider response bodies.

## Release and verification

Migration **00066_essay_context_assistance.sql** depends on the conversational interview migration **00065**. It adds provenance and private request/quota tables with RLS and guarded invoker functions. The application repeats source/audience checks for the local database fallback. Apply the reviewed migration before deploying the matching application. This feature remains unreleased until that separate rollout.

Verification covers structured citations and real source IDs; authorization and assignment; shared quotas; single-use acceptance; student confirmation and both parents' access; stale requirements, source revisions and in-flight withdrawal; retained unsaved edits; unchanged essay writing; phone layouts and accessibility. Browser tests use a loopback HTTP fixture at the real provider SDK boundary, never live model calls. Existing migration, SQL, unit and portal regression suites remain part of the release gate.
