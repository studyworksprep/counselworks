import { z } from "zod";

export const PROMPT_REQUIREMENTS = ["required", "optional", "conditional"] as const;
export const PROMPT_TEXT_KINDS = ["summary", "verbatim"] as const;
export const PROMPT_COVERAGES = ["verified", "no_supplement", "needs_review"] as const;
export const PROMPT_REVIEW_STATES = ["draft", "published", "archived"] as const;
export const httpsSource = z.url().refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Use an HTTPS source link without credentials");
const day = z.iso.date();
export const promptReviewSchema = z.object({
  coverage: z.enum(PROMPT_COVERAGES),
  source_url: httpsSource,
  verified_on: day.nullable(),
  review_due_on: day.nullable(),
  notes: z.string().trim().max(4000),
  review_notes: z.string().trim().max(4000),
  prompts: z.array(z.object({
    prompt_key: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/),
    title: z.string().trim().min(1).max(200),
    prompt_text: z.string().trim().min(1).max(12000),
    word_limit: z.number().int().min(1).max(100000).nullable(),
    character_limit: z.number().int().min(1).max(100000).nullable(),
    requirement: z.enum(PROMPT_REQUIREMENTS),
    text_kind: z.enum(PROMPT_TEXT_KINDS),
  })).max(60),
}).superRefine((value, ctx) => {
  if (new Set(value.prompts.map(p => p.prompt_key)).size !== value.prompts.length)
    ctx.addIssue({ code: "custom", message: "Each response needs a distinct question key", path: ["prompts"] });
  if (value.coverage === "no_supplement" && value.prompts.some(p => p.requirement === "required"))
    ctx.addIssue({ code: "custom", message: "A school with no general supplement cannot have universal required responses", path: ["coverage"] });
});
export type PromptReviewInput = z.infer<typeof promptReviewSchema>;

export function promptSlot(scorecard: number, year: number, key: string) {
  return `${scorecard}:${year}:${key}`;
}

/** Calendar dates are compared without browser timezone conversion. */
export function promptReviewDue(set: { verified_on: string | null; review_due_on?: string | null; coverage: string }, today: string) {
  if (set.coverage === "needs_review" || !set.verified_on) return true;
  const nextCheck = set.review_due_on ?? `${Number(set.verified_on.slice(0, 4)) + 1}${set.verified_on.slice(4)}`;
  return nextCheck <= today;
}

/** A firm's published revision takes precedence. Drafts never enter client requirements. */
export function effectivePromptSets<T extends { scorecard_id: number; entry_year: number; firm_id?: string | null; review_state?: string }>(sets: T[]) {
  const effective = new Map<string, T>();
  for (const set of sets) {
    if (set.review_state && set.review_state !== "published") continue;
    const key = `${set.scorecard_id}:${set.entry_year}`;
    if (!effective.has(key) || set.firm_id) effective.set(key, set);
  }
  return [...effective.values()];
}
