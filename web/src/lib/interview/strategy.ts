import { z } from "zod";
import { familyVisibleEntries, type BankEntry, type InterviewAnswer } from "./template";

export const STRATEGY_SECTIONS = [
  { key: "priorities", title: "Priorities and direction", description: "What the student wants from college and what they are still exploring." },
  { key: "constraints", title: "Requirements and support", description: "Practical constraints, boundaries, tradeoffs and support to plan around." },
  { key: "strengths", title: "Strengths and experiences", description: "Specific experiences that show the student's interests, strengths and growth." },
  { key: "narratives", title: "Possible narrative threads", description: "Themes worth exploring, grounded in the student's stories." },
  { key: "alignment", title: "Student and parent perspectives", description: "Areas of agreement and differences to discuss, with each voice identified." },
  { key: "next_steps", title: "Questions and next steps", description: "Open questions, decisions and actions for the next counseling conversation." },
  { key: "counselor_notes", title: "Private counselor notes", description: "Working notes for the counseling team. This section can never be shared." },
] as const;
export const STRATEGY_KEYS = STRATEGY_SECTIONS.map(s => s.key) as [typeof STRATEGY_SECTIONS[number]["key"], ...typeof STRATEGY_SECTIONS[number]["key"][]];
export const STRATEGY_PUBLICATION_STATES = ["draft", "shared"] as const;
export const STRATEGY_REVIEW_STATES = ["pending", "accurate", "discuss"] as const;
export const strategyReferenceSchema = z.object({ kind: z.enum(["answer", "bank"]), id: z.uuid(), revision: z.number().int().positive() });
export type StrategyReference = z.infer<typeof strategyReferenceSchema>;
export type StrategySection = {
  id: string; student_id: string; section_key: typeof STRATEGY_KEYS[number]; body: string;
  evidence: StrategyReference[]; publication_state: typeof STRATEGY_PUBLICATION_STATES[number];
  student_review: typeof STRATEGY_REVIEW_STATES[number]; student_note: string; family_shared: boolean;
  revision: number; updated_at: string; reviewed_at: string | null;
};
export const strategySectionSchema = z.object({
  studentId: z.uuid(), id: z.uuid().optional(), sectionKey: z.enum(STRATEGY_KEYS),
  body: z.string().trim().min(1).max(12000), publicationState: z.enum(STRATEGY_PUBLICATION_STATES),
  sourceKeys: z.array(z.string().regex(/^(answer|bank):[0-9a-f-]{36}$/i)).max(20), revision: z.number().int().min(0),
});
export const strategyReviewSchema = z.object({
  studentId: z.uuid(), id: z.uuid(), revision: z.number().int().positive(),
  review: z.enum(STRATEGY_REVIEW_STATES), note: z.string().trim().max(3000), familyShared: z.boolean(),
});
export type StrategySources = { answers: InterviewAnswer[]; entries: BankEntry[] };
export function strategySourceKey(ref: Pick<StrategyReference, "kind" | "id">) { return `${ref.kind}:${ref.id}`; }
export function strategySourcesCurrent(refs: StrategyReference[], sources: StrategySources) {
  return refs.every(ref => (ref.kind === "answer" ? sources.answers : sources.entries).some(s => s.id === ref.id && s.revision === ref.revision));
}
export function strategySourcesVisible(refs: StrategyReference[], sources: StrategySources, audience: "student" | "family") {
  const answers = sources.answers.filter(a => audience === "student" ? a.respondent_kind === "student" || a.audience === "family" : a.audience === "family");
  const entries = audience === "family" ? familyVisibleEntries(sources.entries) : sources.entries;
  return refs.every(ref => (ref.kind === "answer" ? answers : entries).some(s => s.id === ref.id));
}
// Repeated in RLS; also protects local development's service-role fallback.
export function visibleStrategySections(rows: StrategySection[], sources: StrategySources, kind: "staff" | "student" | "parent") {
  if (kind === "staff") return rows;
  return rows.filter(row => row.section_key !== "counselor_notes" && row.publication_state === "shared" &&
    strategySourcesVisible(row.evidence, sources, kind === "parent" ? "family" : "student") &&
    (kind === "student" || (row.family_shared && row.student_review === "accurate" && strategySourcesCurrent(row.evidence, sources))));
}
