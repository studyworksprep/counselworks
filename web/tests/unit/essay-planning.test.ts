import { describe, expect, it } from "vitest";
import { connectedStories, essayPlanSchema, familyPlanVisible, materialConfirmed, planningRows, planningSignals, planningSourcesCurrent, type EssayPlan, type EssayPlanningBoardData, type PlanningEntry, type PlanningEssay, type PlanningRow, type PlanningSchoolSource } from "@/lib/essays/planning";

const id = (n: number) => `59000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const story = (n: number, patch: Partial<PlanningEntry> = {}): PlanningEntry => ({ id: id(n), kind: "story", title: `Story ${n}`, body: "A scene", reflection: "", tags: [], audience: "family", review_state: "confirmed", story_ids: [], revision: 1, ...patch });
const essay = (n: number, patch: Partial<PlanningEssay> = {}): PlanningEssay => ({ id: id(n), title: `Essay ${n}`, essay_type: "supplemental", prompt_text: "Assigned wording", status: "draft", visibility_scope: "family", student_college_id: id(50), application_id: null, library_prompt_id: null, library_prompt_slot: null, library_prompt_snapshot: null, wordLimit: 250, characterLimit: null, wordCount: 0, characterCount: 0, current_version_number: 1, ...patch });
const plan = (n: number, patch: Partial<EssayPlan> = {}): EssayPlan => ({ essay_id: id(n), approach: "experience", angle: "A distinct angle", source_versions: [{ id: id(10), revision: 1 }], review_state: "confirmed", family_shared: true, revision: 1, updated_at: "2026-11-14T12:00:00Z", ...patch });
const row = (n: number, patch: Partial<PlanningRow> = {}): PlanningRow => ({ id: `essay:${id(n)}`, schoolId: id(50), title: `Essay ${n}`, promptText: "Assigned wording", requirement: "required", promptId: null, sourceUrl: null, textKind: null, wordLimit: 250, characterLimit: null, requirementsChanged: false, currentPrompt: null, essay: essay(n), plan: plan(n), entryIds: [id(10)], ...patch });
const data = (rows: PlanningRow[], entries: PlanningEntry[], surface: EssayPlanningBoardData["surface"] = "student"): EssayPlanningBoardData => ({ student: { id: id(1), name: "Student", graduationYear: 2027 }, surface, canEdit: surface !== "family", canAssign: surface === "staff", schools: [], rows, entries });
const school = (): PlanningSchoolSource => ({ id: id(50), name: "Example College", scorecardId: 990001, applicationId: null, deadline: null, round: "rd", coverage: "verified", sourceUrl: "https://example.edu", checkedOn: "2026-11-14", notes: "", promptSet: {
  id: id(60), scorecard_id: 990001, college_name: "Example College", entry_year: 2027, coverage: "verified", source_url: "https://example.edu", verified_on: "2026-11-14", notes: "",
  college_library_prompts: [{ id: id(61), prompt_key: "why", title: "Why here", prompt_text: "Current wording", word_limit: 200, character_limit: null, requirement: "required", text_kind: "verbatim", sort_order: 0 }],
} });

describe("essay planning requirement identity", () => {
  it("matches revised requirements by logical slot while preserving assigned wording and limits", () => {
    const e = essay(1, { library_prompt_id: id(59), library_prompt_slot: "990001:2027:why", prompt_text: "Original assignment", wordLimit: 250 });
    const rows = planningRows([school()], [e]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ essay: { id: e.id }, promptText: "Original assignment", wordLimit: 250, requirementsChanged: true, currentPrompt: { text: "Current wording", wordLimit: 200 } });
  });
  it("keeps historical-year assignments separate from the current year's prompt", () => {
    const e = essay(1, { library_prompt_id: id(59), library_prompt_slot: "990001:2026:why", library_prompt_snapshot: { entry_year: 2026, requirement: "required" } });
    const rows = planningRows([school()], [e]);
    expect(rows).toHaveLength(2);
    expect(rows[0].essay).toBeNull();
    expect(rows[1]).toMatchObject({ essay: { id: e.id }, requirementsChanged: true });
  });
  it("keeps general essays and application-linked manual prompts on the board", () => {
    const s = { ...school(), applicationId: id(70) };
    const rows = planningRows([s], [essay(1, { student_college_id: null, application_id: id(70) }), essay(2, { student_college_id: null })]);
    expect(rows.find(r => r.essay?.id === id(1))?.schoolId).toBe(s.id);
    expect(rows.find(r => r.essay?.id === id(2))?.schoolId).toBeNull();
  });
  it("does not turn unassigned optional and conditional responses into required gaps", () => {
    const rows = (["required", "optional", "conditional"] as const).map((requirement, n) => row(n, { essay: null, requirement, plan: null, entryIds: [] }));
    const report = planningSignals(data(rows, [], "staff"));
    expect([...report.signals.values()].map(s => s.gaps.length)).toEqual([1, 0, 0]);
  });
  it("does not characterize unshared work as missing in the family view", () => {
    const report = planningSignals(data([row(1, { essay: null, plan: null, entryIds: [] }), row(2, { plan: null, entryIds: [] })], [], "family"));
    expect([...report.signals.values()].every(s => s.gaps.length === 0)).toBe(true);
  });
});

describe("planning-note audience and source versions", () => {
  it("requires the displayed source revisions for exactly the selected material", () => {
    const form = { studentId: id(1), essayId: id(2), revision: 0, expectedLinks: [], entryIds: [id(10)], sourceVersions: [{ id: id(10), revision: 1 }], approach: "experience", angle: "An angle", reviewState: "draft", familyShared: false };
    expect(essayPlanSchema.safeParse(form).success).toBe(true);
    for (const sourceVersions of [[], [{ id: id(11), revision: 1 }], [{ id: id(10), revision: 0 }], [{ id: id(10), revision: 1 }, { id: id(10), revision: 1 }]]) expect(essayPlanSchema.safeParse({ ...form, sourceVersions }).success).toBe(false);
  });
  it("requires independent essay sharing and student approval", () => {
    for (const p of [plan(1, { family_shared: false }), plan(1, { review_state: "draft" }), plan(1, { review_state: "revisit" })]) expect(familyPlanVisible(p, essay(1), [id(10)], [story(10)])).toBe(false);
    expect(familyPlanVisible(plan(1), essay(1, { visibility_scope: "student" }), [id(10)], [story(10)])).toBe(false);
    expect(familyPlanVisible(plan(1), essay(1), [id(10)], [story(10)])).toBe(true);
  });
  it.each(["counselor", "draft", "missing", "revised"])("denies a family note with %s source evidence", state => {
    const entries = state === "missing" ? [] : [story(10, state === "counselor" ? { audience: "counselor" } : state === "draft" ? { review_state: "draft" } : { revision: 2 })];
    expect(familyPlanVisible(plan(1), essay(1), [id(10)], entries)).toBe(false);
  });
  it("requires exactly the connected source set, including newly private connections", () => {
    expect(planningSourcesCurrent(plan(1), [id(10), id(12)], [story(10)])).toBe(false);
    expect(planningSourcesCurrent(plan(1), [], [story(10)])).toBe(false);
    expect(planningSourcesCurrent(plan(1, { source_versions: [{ id: id(10), revision: 1 }, { id: id(10), revision: 1 }] }), [id(10), id(12)], [story(10)])).toBe(false);
  });
  it("fails closed on malformed version metadata", () => {
    const bad = { ...plan(1), source_versions: [{ id: id(10), revision: null }] } as unknown as EssayPlan;
    expect(planningSourcesCurrent(bad, [id(10)], [story(10)])).toBe(false);
  });
  it("honors the sharing of every supporting story behind a narrative", () => {
    const narrative = story(11, { kind: "narrative", story_ids: [id(10)] });
    const p = plan(1, { source_versions: [{ id: id(11), revision: 1 }] });
    expect(familyPlanVisible(p, essay(1), [id(11)], [narrative, story(10)])).toBe(true);
    expect(familyPlanVisible(p, essay(1), [id(11)], [narrative, story(10, { audience: "counselor" })])).toBe(false);
    expect(materialConfirmed(narrative, [narrative])).toBe(false);
  });
});

describe("planning gaps and story reuse", () => {
  const narrative = story(11, { kind: "narrative", story_ids: [id(10)] });
  it("counts one story once per essay even when directly connected and inside a narrative", () => {
    expect(connectedStories([id(10), id(11)], [story(10), narrative])).toEqual([id(10)]);
    const report = planningSignals(data([row(1, { entryIds: [id(10), id(11)] })], [story(10), narrative]));
    expect(report.storyUse.get(id(10))).toHaveLength(1);
    expect(report.signals.get(`essay:${id(1)}`)?.overlap).toEqual([]);
  });
  it("finds same-college overlap through different narrative connections", () => {
    const other = story(12, { kind: "narrative", story_ids: [id(10)] });
    const rows = [row(1, { entryIds: [id(11)] }), row(2, { entryIds: [id(12)] })];
    const report = planningSignals(data(rows, [story(10), narrative, other]));
    expect(report.signals.get(rows[0].id)?.overlap).toEqual([id(10)]);
    expect(report.signals.get(rows[1].id)?.overlap).toEqual([id(10)]);
  });
  it("shows cross-college reuse without labeling it same-college repetition", () => {
    const rows = [row(1), row(2, { schoolId: id(51) }), row(3, { schoolId: null })];
    const report = planningSignals(data(rows, [story(10)]));
    expect(report.storyUse.get(id(10))).toHaveLength(3);
    expect([...report.signals.values()].every(s => s.overlap.length === 0)).toBe(true);
  });
  it("supports a reviewed research angle without forcing a personal story", () => {
    const r = row(1, { entryIds: [], plan: plan(1, { approach: "research", source_versions: [] }) });
    expect(planningSignals(data([r], [])).signals.get(r.id)).toMatchObject({ gaps: [], needsReview: false, reviewed: true });
    r.plan!.approach = "experience";
    expect(planningSignals(data([r], [])).signals.get(r.id)?.gaps).toContain("Connect a story or narrative");
  });
  it("requires review of new requirements and revised stories independently of essay status", () => {
    const r = row(1, { requirementsChanged: true, essay: essay(1, { status: "final" }) });
    expect(planningSignals(data([r], [story(10, { revision: 2 })])).signals.get(r.id)).toMatchObject({ sourcesChanged: true, needsReview: true, reviewed: false });
  });
});
