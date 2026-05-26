import { z } from "zod";

// ---------------------------------------------------------------------------
// Prompt analysis (capability 1)
// ---------------------------------------------------------------------------

export const promptTypeSchema = z.enum([
  "why_us",
  "personal_narrative",
  "creative",
  "activity_expansion",
  "community",
  "diversity",
  "intellectual_curiosity",
  "leadership",
  "other",
]);

export const promptAnalysisSchema = z.object({
  prompt_type: promptTypeSchema.describe(
    "The dominant supplement-essay archetype this prompt belongs to.",
  ),
  word_count_limit: z
    .number()
    .int()
    .nullable()
    .describe(
      "Word limit extracted from the prompt text, or null if not specified.",
    ),
  underlying_question: z
    .string()
    .describe(
      "One concise sentence describing what the admissions reader actually wants to learn from this essay.",
    ),
  what_they_want_to_see: z
    .array(z.string())
    .min(2)
    .max(5)
    .describe(
      "2-5 specific qualities, experiences, or thinking habits this prompt is designed to surface.",
    ),
  common_pitfalls: z
    .array(z.string())
    .min(2)
    .max(4)
    .describe(
      "2-4 common failure modes for this prompt type — generic answers, surface-level reflection, etc.",
    ),
});

export type PromptAnalysis = z.infer<typeof promptAnalysisSchema>;

// ---------------------------------------------------------------------------
// Brainstorm angles (capability 2)
// ---------------------------------------------------------------------------

export const brainstormAngleSchema = z.object({
  title: z
    .string()
    .describe("Short label (3-7 words) the student can use to identify this angle."),
  hook: z
    .string()
    .describe(
      "A single sentence the essay could open with that grounds the reader in a specific moment or image.",
    ),
  why_it_works: z
    .string()
    .describe(
      "Two sentences on why this angle responds to the underlying question and what specific qualities it surfaces.",
    ),
  questions_to_explore: z
    .array(z.string())
    .min(2)
    .max(4)
    .describe(
      "2-4 prompting questions to help the student draw out specific details for this angle.",
    ),
});

export const brainstormResultSchema = z.object({
  angles: z
    .array(brainstormAngleSchema)
    .min(3)
    .max(5)
    .describe(
      "3-5 distinct, non-overlapping candidate angles. Each angle should draw on different aspects of the student's profile.",
    ),
});

export type BrainstormAngle = z.infer<typeof brainstormAngleSchema>;
export type BrainstormResult = z.infer<typeof brainstormResultSchema>;

// ---------------------------------------------------------------------------
// Outline (capability 3)
// ---------------------------------------------------------------------------

export const outlineBeatSchema = z.object({
  section: z
    .enum(["hook", "body", "reflection"])
    .describe("Which part of the essay this beat belongs to."),
  beat: z
    .string()
    .describe(
      "One sentence describing what happens in this beat — a scene, claim, or observation.",
    ),
  word_target: z
    .number()
    .int()
    .nullable()
    .describe(
      "Rough word count target for this beat, calculated to fit the overall word limit. Null if no limit was specified.",
    ),
});

export const outlineResultSchema = z.object({
  thesis: z
    .string()
    .describe(
      "The single sentence that captures what this essay is really arguing or revealing.",
    ),
  beats: z
    .array(outlineBeatSchema)
    .min(4)
    .max(8)
    .describe(
      "4-8 ordered beats covering hook -> body -> reflection. Sum of word_target values should approximate the word limit if known.",
    ),
});

export type OutlineBeat = z.infer<typeof outlineBeatSchema>;
export type OutlineResult = z.infer<typeof outlineResultSchema>;

// ---------------------------------------------------------------------------
// Coach review suggestions (capability 4, counselor-only)
// ---------------------------------------------------------------------------

export const reviewCategorySchema = z.enum([
  "specificity",
  "vague_claim",
  "voice_consistency",
  "redundancy",
  "transition",
  "prompt_coverage",
  "word_count",
]);

export const reviewSuggestionSchema = z.object({
  category: reviewCategorySchema.describe(
    "The class of issue this suggestion addresses. Used to group and filter on the coach side.",
  ),
  quoted_span: z
    .string()
    .nullable()
    .describe(
      "Exact substring from the student's draft this suggestion applies to, or null for whole-essay observations (prompt_coverage, word_count).",
    ),
  observation: z
    .string()
    .describe(
      "Plain-language description of what's weak about the quoted span. Avoid prescriptive 'instead say X' rewrites — describe the gap.",
    ),
  prompting_question: z
    .string()
    .describe(
      "Question the coach can ask the student to surface a stronger detail, image, or claim. Do not propose rewritten text.",
    ),
  preserves_voice: z
    .boolean()
    .describe(
      "Confirmation that the suggestion improves the draft without flattening the student's natural voice.",
    ),
});

export const coachReviewResultSchema = z.object({
  overall_assessment: z
    .string()
    .describe(
      "Two-to-three sentence summary of what's working in this draft and what most needs attention.",
    ),
  suggestions: z
    .array(reviewSuggestionSchema)
    .min(3)
    .max(15)
    .describe(
      "3-15 prioritized suggestions across the categories. Order by importance (most impactful first).",
    ),
});

export type ReviewCategory = z.infer<typeof reviewCategorySchema>;
export type ReviewSuggestion = z.infer<typeof reviewSuggestionSchema>;
export type CoachReviewResult = z.infer<typeof coachReviewResultSchema>;

// ---------------------------------------------------------------------------
// College ingest — enrichment of newly-imported Scorecard records
// ---------------------------------------------------------------------------

export const applicationPlatformSchema = z.enum([
  "common_app",
  "coalition_app",
  "uc_app",
  "apply_texas",
  "csu_apply",
  "suny",
  "school_specific",
  "unknown",
]);

export const institutionKindSchema = z.enum([
  "national_university",
  "liberal_arts_college",
  "regional_university",
  "regional_college",
  "specialty",
  "unknown",
]);

export const collegeEnrichmentSchema = z.object({
  normalized_name: z
    .string()
    .describe(
      "The school's canonical display name. Expand abbreviations (e.g. 'U of Pennsylvania' -> 'University of Pennsylvania') and remove trailing punctuation. Do NOT invent a name; only normalize what's given.",
    ),
  application_platform: applicationPlatformSchema.describe(
    "The primary application platform this school uses. 'unknown' is acceptable — do not guess.",
  ),
  institution_kind: institutionKindSchema.describe(
    "The school's category in US News classification. Used purely for filtering. 'unknown' is acceptable.",
  ),
  alternate_names: z
    .array(z.string())
    .max(5)
    .describe(
      "Up to 5 well-known alternate names or abbreviations (e.g. 'Penn', 'UPenn' for University of Pennsylvania). Empty array if none apply.",
    ),
});

export type CollegeEnrichment = z.infer<typeof collegeEnrichmentSchema>;

// ---------------------------------------------------------------------------
// College ingest — discrepancy classification
// ---------------------------------------------------------------------------

export const discrepancyClassificationSchema = z.object({
  classification: z
    .enum(["meaningful", "cosmetic"])
    .describe(
      "meaningful = a real factual difference an admin should review. cosmetic = a formatting/whitespace/punctuation difference the admin can ignore or auto-accept.",
    ),
  assessment: z
    .string()
    .max(200)
    .describe(
      "One concise sentence explaining the classification. Plain English; describe the diff and why it matters or doesn't.",
    ),
});

export type DiscrepancyClassification = z.infer<
  typeof discrepancyClassificationSchema
>;
