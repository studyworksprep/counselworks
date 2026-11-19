import type { ContextReference } from "../ai/student-context";
import type { EssayProvenance } from "../ai/essay-context";
import { z } from "zod";
import { outlineResultSchema } from "../ai/schemas";
import {
  planSourceSchema,
  planningSourcesCurrent,
  type EssayPlan,
  type PlanningEntry,
  type PlanningRow,
} from "./planning";
import { familyVisibleEntries } from "../interview/template";
import type { TaskSurface } from "../constants/task-links";

export const OUTLINE_REVIEWS = ["draft", "confirmed", "revisit"] as const;
export const outlineBeatSchema = z
  .object({
    id: z.uuid(),
    heading: z.string().max(160),
    notes: z.string().max(3000),
    entry_ids: z.array(z.uuid()).max(20),
  })
  .strict();
export const outlineContentSchema = z
  .object({
    purpose: z.string().max(2000),
    beats: outlineBeatSchema.array().max(12),
  })
  .strict()
  .refine(
    (c) =>
      new Set(c.beats.map((b) => b.id)).size === c.beats.length &&
      c.beats.every((b) => new Set(b.entry_ids).size === b.entry_ids.length),
    "Choose each section and source once",
  );
export const outlineContextSchema = z
  .object({
    plan_revision: z.number().int().positive().nullable(),
    prompt_signature: z.string().regex(/^[a-f0-9]{32}$/),
    prompt_set_id: z.uuid().nullable(),
    source_versions: planSourceSchema.array(),
  })
  .strict();
export const saveOutlineSchema = z.object({
  essayId: z.uuid(),
  revision: z.number().int().min(0),
  content: outlineContentSchema,
  context: outlineContextSchema,
  review: z.enum(OUTLINE_REVIEWS),
  familyShared: z.boolean(),
});
export const revisionTaskSchema = z.object({
  feedbackId: z.uuid(),
  title: z.string().trim().min(1).max(200),
  instructions: z.string().trim().min(1).max(6000),
  dueOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});
export const feedbackInputSchema = z.object({
  versionNumber: z.number().int().positive(),
  body: z.string().trim().min(1).max(12000),
  quotedText: z.string().min(1).max(8000).nullable().optional(),
  anchorStart: z.number().int().nonnegative().nullable().optional(),
  anchorEnd: z.number().int().positive().nullable().optional(),
});
export type OutlineContent = z.infer<typeof outlineContentSchema>;
export type OutlineContext = z.infer<typeof outlineContextSchema>;
export type EssayOutline = {
  ai_source_refs?: ContextReference[];
  provenance?: EssayProvenance;
  essay_id: string;
  content: OutlineContent;
  context_versions: OutlineContext | null;
  review_state: (typeof OUTLINE_REVIEWS)[number];
  family_shared: boolean;
  revision: number;
  updated_at: string;
};
export type SavedEssayVersion = {
  id: string;
  number: number;
  body: string;
  submitted: boolean;
  latestSubmitted: boolean;
  submittedAt: string | null;
  createdAt: string;
};
export type RevisionTask = {
  id: string;
  feedbackId: string;
  title: string;
  status: string;
  ownerPending: boolean;
};
export type EssayDraftingData = {
  decisionHref?: string | null;
  essayId: string;
  studentId: string;
  surface: TaskSurface;
  canEdit: boolean;
  canAssignRevisions: boolean;
  row: PlanningRow;
  entries: PlanningEntry[];
  outline: EssayOutline | null;
  context: OutlineContext | null;
  outlineStale: boolean;
  sourcesStale: boolean;
  requirementsChanged: boolean;
  materialNeedsReview: boolean;
  familyReady: boolean;
  versions: SavedEssayVersion[];
  tasks: RevisionTask[];
};
export function outlineContextCurrent(
  saved: OutlineContext | null,
  current: OutlineContext | null,
) {
  if (!saved || !current) return false;
  const a = outlineContextSchema.safeParse(saved),
    b = outlineContextSchema.safeParse(current);
  if (!a.success || !b.success) return false;
  return (
    a.data.plan_revision === b.data.plan_revision &&
    a.data.prompt_signature === b.data.prompt_signature &&
    a.data.prompt_set_id === b.data.prompt_set_id &&
    a.data.source_versions.length === b.data.source_versions.length &&
    new Set(a.data.source_versions.map((s) => s.id)).size ===
      a.data.source_versions.length &&
    a.data.source_versions.every((ref) =>
      b.data.source_versions.some(
        (s) => s.id === ref.id && s.revision === ref.revision,
      ),
    )
  );
}
export function outlineFamilyReady(
  visibility: string,
  plan: EssayPlan | null,
  context: OutlineContext,
  entries: PlanningEntry[],
) {
  const family = new Set(familyVisibleEntries(entries).map((e) => e.id));
  return (
    ["family", "firm"].includes(visibility) &&
    context.source_versions.every((s) => family.has(s.id)) &&
    (context.plan_revision == null ||
      (!!plan &&
        plan.revision === context.plan_revision &&
        plan.family_shared &&
        plan.review_state === "confirmed" &&
        planningSourcesCurrent(
          plan,
          context.source_versions.map((s) => s.id),
          entries,
        )))
  );
}
export function importedCounselorOutline(
  value: unknown,
  ids: string[],
): OutlineContent | null {
  const parsed = outlineResultSchema.safeParse(value);
  if (
    !parsed.success ||
    ids.length < parsed.data.beats.length ||
    !z.uuid().array().safeParse(ids).success
  )
    return null;
  return {
    purpose: parsed.data.thesis.slice(0, 2000),
    beats: parsed.data.beats.map((b, i) => ({
      id: ids[i],
      heading:
        b.section === "hook"
          ? "Opening"
          : b.section === "reflection"
            ? "Reflection"
            : `Development ${i + 1}`,
      notes: b.beat.slice(0, 3000),
      entry_ids: [],
    })),
  };
}
export function isCounselorOutline(value: unknown) {
  return outlineResultSchema.safeParse(value).success;
}

export type DraftDifference = {
  kind: "same" | "added" | "removed";
  text: string;
};
/** Bounded LCS preserves exact whitespace; unusually large drafts use a coarse
 * replacement after trimming their common edges rather than freezing the UI. */
export function compareSavedDrafts(
  before: string,
  after: string,
): DraftDifference[] {
  if (before === after) return [{ kind: "same", text: before }];
  const a = before.match(/\S+\s*|\s+/g) ?? [],
    b = after.match(/\S+\s*|\s+/g) ?? [],
    result: DraftDifference[] = [];
  const push = (kind: DraftDifference["kind"], text: string) => {
    if (!text) return;
    const last = result.at(-1);
    if (last?.kind === kind) last.text += text;
    else result.push({ kind, text });
  };
  let start = 0,
    endA = a.length,
    endB = b.length;
  while (start < endA && start < endB && a[start] === b[start]) start++;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  push("same", a.slice(0, start).join(""));
  const n = endA - start,
    m = endB - start;
  if ((n + 1) * (m + 1) > 1_000_000) {
    push("removed", a.slice(start, endA).join(""));
    push("added", b.slice(start, endB).join(""));
  } else {
    const width = m + 1,
      lengths = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--)
        lengths[i * width + j] =
          a[start + i] === b[start + j]
            ? lengths[(i + 1) * width + j + 1] + 1
            : Math.max(
                lengths[(i + 1) * width + j],
                lengths[i * width + j + 1],
              );
    let i = 0,
      j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[start + i] === b[start + j]) {
        push("same", a[start + i]);
        i++;
        j++;
      } else if (
        i < n &&
        (j === m || lengths[(i + 1) * width + j] >= lengths[i * width + j + 1])
      )
        push("removed", a[start + i++]);
      else push("added", b[start + j++]);
    }
  }
  push("same", a.slice(endA).join(""));
  return result;
}
