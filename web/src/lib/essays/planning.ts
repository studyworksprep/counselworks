import { z } from "zod";
import type { BankEntry } from "../interview/template";
import { familyVisibleEntries } from "../interview/template";
import { promptSlot } from "../colleges/prompt-review";
import type { CollegePromptSetRow } from "../db/queries";
import type { TaskSurface } from "../constants/task-links";

export const PLAN_APPROACHES = ["exploring", "experience", "research"] as const;
export const PLAN_APPROACH_LABELS = { exploring: "Still exploring", experience: "Experience or story", research: "Research or college fit" };
export const PLAN_REVIEW_STATES = ["draft", "confirmed", "revisit"] as const;
export const planSourceSchema = z.object({ id: z.uuid(), revision: z.number().int().positive() });
export const essayPlanSchema = z.object({
  studentId: z.uuid(), essayId: z.uuid(), revision: z.number().int().min(0),
  expectedLinks: z.array(z.uuid()).max(1000), entryIds: z.array(z.uuid()).max(20),
  sourceVersions: planSourceSchema.array().max(20),
  approach: z.enum(PLAN_APPROACHES), angle: z.string().trim().max(6000),
  reviewState: z.enum(PLAN_REVIEW_STATES), familyShared: z.boolean(),
}).refine(p => new Set(p.entryIds).size === p.entryIds.length && new Set(p.expectedLinks).size === p.expectedLinks.length &&
  p.sourceVersions.length === p.entryIds.length && new Set(p.sourceVersions.map(s => s.id)).size === p.entryIds.length && p.sourceVersions.every(s => p.entryIds.includes(s.id)), "Choose each source once with its displayed revision");
export type PlanningEntry = Pick<BankEntry, "id" | "kind" | "title" | "body" | "reflection" | "tags" | "audience" | "review_state" | "story_ids" | "revision">;
export type EssayPlan = { essay_id: string; approach: typeof PLAN_APPROACHES[number]; angle: string; source_versions: z.infer<typeof planSourceSchema>[];
  review_state: typeof PLAN_REVIEW_STATES[number]; family_shared: boolean; revision: number; updated_at: string };
export type PlanningEssay = { id: string; title: string | null; essay_type: string; prompt_text: string | null; status: string; visibility_scope: string;
  student_college_id: string | null; application_id: string | null; library_prompt_id: string | null; library_prompt_slot: string | null;
  library_prompt_snapshot: unknown; wordLimit: number | null; characterLimit: number | null; wordCount: number; characterCount: number; current_version_number: number };
export type PlanningSchool = { id: string; name: string; applicationId: string | null; deadline: string | null; round: string | null;
  coverage: CollegePromptSetRow["coverage"] | null; sourceUrl: string | null; checkedOn: string | null; notes: string };
export type PlanningSchoolSource = PlanningSchool & { scorecardId: number | null; promptSet: CollegePromptSetRow | null };
export type PlanningRow = { id: string; schoolId: string | null; title: string; promptText: string; requirement: "required" | "optional" | "conditional" | "custom";
  promptId: string | null; sourceUrl: string | null; textKind: string | null; wordLimit: number | null; characterLimit: number | null;
  requirementsChanged: boolean; currentPrompt: { text: string; wordLimit: number | null; characterLimit: number | null } | null;
  essay: PlanningEssay | null; plan: EssayPlan | null; entryIds: string[] };
export type EssayPlanningBoardData = { student: { id: string; name: string; graduationYear: number }; surface: TaskSurface; canEdit: boolean; canAssign: boolean;
  schools: PlanningSchool[]; rows: PlanningRow[]; entries: PlanningEntry[] };

export function essayPlanningPath(studentId: string, surface: TaskSurface) {
  return surface === "staff" ? `/students/${studentId}/essays/planning` : surface === "student" ? "/student-essays/planning" : `/family-essay-planning/${studentId}`;
}
export function planningSourcesCurrent(plan: EssayPlan, ids: string[], entries: PlanningEntry[]) {
  const refs = planSourceSchema.array().safeParse(plan.source_versions);
  return refs.success && refs.data.length === ids.length && new Set(refs.data.map(r => r.id)).size === ids.length &&
    refs.data.every(ref => ids.includes(ref.id) && entries.some(e => e.id === ref.id && e.revision === ref.revision));
}
export function familyPlanVisible(plan: EssayPlan, essay: PlanningEssay, ids: string[], entries: PlanningEntry[]) {
  const visible = familyVisibleEntries(entries);
  return ["family", "firm"].includes(essay.visibility_scope) && plan.family_shared && plan.review_state === "confirmed" && planningSourcesCurrent(plan, ids, visible);
}
const snapshotSchema = z.object({ entry_year: z.number().optional(), requirement: z.enum(["required", "optional", "conditional"]).optional(), source_url: z.string().optional(), text_kind: z.string().optional() });
export function planningRows(schools: PlanningSchoolSource[], essays: PlanningEssay[]): PlanningRow[] {
  const used = new Set<string>(), rows: PlanningRow[] = [];
  const schoolForEssay = (e: PlanningEssay) => schools.find(s => s.id === e.student_college_id) ?? schools.find(s => s.applicationId != null && s.applicationId === e.application_id);
  const assigned = (e: PlanningEssay, school: PlanningSchoolSource | undefined, current?: CollegePromptSetRow["college_library_prompts"][number]): PlanningRow => {
    const snapshot = snapshotSchema.safeParse(e.library_prompt_snapshot);
    const old = snapshot.success ? snapshot.data : null;
    const changed = !!current && e.library_prompt_id !== current.id;
    return { id: `essay:${e.id}`, schoolId: school?.id ?? null, title: e.title || "Untitled response", promptText: e.prompt_text ?? "",
      requirement: current?.requirement ?? old?.requirement ?? "custom", promptId: current?.id ?? null,
      sourceUrl: old?.source_url ?? school?.sourceUrl ?? null, textKind: old?.text_kind ?? null,
      wordLimit: e.wordLimit, characterLimit: e.characterLimit, requirementsChanged: changed || !!(old?.entry_year && school?.promptSet && old.entry_year !== school.promptSet.entry_year),
      currentPrompt: changed && current ? { text: current.prompt_text, wordLimit: current.word_limit, characterLimit: current.character_limit } : null,
      essay: e, plan: null, entryIds: [] };
  };
  for (const school of schools) {
    const set = school.promptSet;
    for (const prompt of [...(set?.college_library_prompts ?? [])].sort((a, b) => a.sort_order - b.sort_order)) {
      const essay = essays.find(e => schoolForEssay(e)?.id === school.id && (e.library_prompt_id === prompt.id || (set && prompt.prompt_key && e.library_prompt_slot === promptSlot(set.scorecard_id, set.entry_year, prompt.prompt_key))));
      if (essay) { used.add(essay.id); rows.push(assigned(essay, school, prompt)); }
      else rows.push({ id: `prompt:${prompt.id}`, schoolId: school.id, title: prompt.title, promptText: prompt.prompt_text, requirement: prompt.requirement,
        promptId: prompt.id, sourceUrl: set?.source_url ?? null, textKind: prompt.text_kind, wordLimit: prompt.word_limit, characterLimit: prompt.character_limit,
        requirementsChanged: false, currentPrompt: null, essay: null, plan: null, entryIds: [] });
    }
  }
  for (const essay of essays) if (!used.has(essay.id)) rows.push(assigned(essay, schoolForEssay(essay)));
  return rows;
}
export function connectedStories(ids: string[], entries: PlanningEntry[]) {
  const result = new Set<string>();
  for (const id of ids) {
    const entry = entries.find(e => e.id === id);
    if (entry?.kind === "story") result.add(entry.id);
    if (entry?.kind === "narrative") for (const story of entry.story_ids) if (entries.some(e => e.id === story && e.kind === "story")) result.add(story);
  }
  return [...result];
}
export function materialConfirmed(entry: PlanningEntry, entries: PlanningEntry[]) {
  return entry.review_state === "confirmed" && (entry.kind === "story" || (entry.story_ids.length > 0 && entry.story_ids.every(id => entries.some(s => s.id === id && s.kind === "story" && s.review_state === "confirmed"))));
}
export function planningSignals(data: EssayPlanningBoardData) {
  const usage = new Map<string, Set<string>>(), storyUse = new Map<string, PlanningRow[]>();
  for (const row of data.rows.filter(r => r.essay)) {
    for (const id of row.entryIds) { if (!usage.has(id)) usage.set(id, new Set()); usage.get(id)!.add(row.id); }
    for (const id of connectedStories(row.entryIds, data.entries)) { if (!storyUse.has(id)) storyUse.set(id, []); storyUse.get(id)!.push(row); }
  }
  const signals = new Map(data.rows.map(row => {
    const sourcesChanged = !!row.plan && !planningSourcesCurrent(row.plan, row.entryIds, data.entries);
    const materialReview = row.entryIds.some(id => { const entry = data.entries.find(e => e.id === id); return !entry || !materialConfirmed(entry, data.entries); });
    const overlap = row.essay && row.schoolId ? connectedStories(row.entryIds, data.entries).filter(id => (storyUse.get(id) ?? []).some(other => other.id !== row.id && other.schoolId === row.schoolId)) : [];
    const gaps: string[] = [];
    if (!row.essay) { if (row.requirement === "required" && data.surface !== "family") gaps.push(data.surface === "staff" ? "Required response not assigned" : "Required response not assigned to you"); }
    else if (data.surface !== "family") {
      if (!row.plan?.angle.trim() || row.plan.approach === "exploring") gaps.push("Choose an approach and angle");
      if (row.plan?.approach === "experience" && !row.entryIds.length) gaps.push("Connect a story or narrative");
    }
    const needsReview = !!row.essay && (row.requirementsChanged || sourcesChanged || materialReview || (!!row.plan && row.plan.review_state !== "confirmed"));
    const reviewed = !!row.plan && row.plan.review_state === "confirmed" && !gaps.length && !needsReview;
    return [row.id, { gaps, needsReview, sourcesChanged, materialReview, overlap, reviewed }] as const;
  }));
  return { usage, storyUse, signals };
}
