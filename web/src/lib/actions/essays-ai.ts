"use server";

import { revalidatePath } from "next/cache";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AI_MODEL, extractUsage, getAnthropicClient } from "../ai/client";
import {
  BRAINSTORM_SYSTEM,
  OUTLINE_SYSTEM,
  PROMPT_ANALYSIS_SYSTEM,
} from "../ai/prompts";
import {
  brainstormResultSchema,
  outlineResultSchema,
  promptAnalysisSchema,
  type BrainstormResult,
  type CoachReviewResult,
  type OutlineResult,
  type PromptAnalysis,
} from "../ai/schemas";
import { requireEssayWriteAccess } from "../auth/essays";
import { isStaffRole, resolveUserAndFirm } from "../auth/resolve";
import { getDb } from "../db/client";

type ActionResult<T> = { error: string } | { data: T };

interface EssayContext {
  id: string;
  firm_id: string;
  student_id: string;
  prompt_text: string | null;
  body: string | null;
  word_count_target: number | null;
  prompt_analysis: Record<string, unknown> | null;
}

async function loadEssayForFirm(
  db: ReturnType<typeof getDb>,
  essayId: string,
  firmId: string,
): Promise<EssayContext | null> {
  const { data } = await db
    .from("essay_drafts")
    .select(
      "id, firm_id, student_id, prompt_text, body, word_count_target, prompt_analysis",
    )
    .eq("id", essayId)
    .eq("firm_id", firmId)
    .single();
  if (!data) return null;
  return data as EssayContext;
}

async function logUsage(
  db: ReturnType<typeof getDb>,
  firmId: string,
  feature: string,
  essayDraftId: string,
  createdByUserId: string,
  usage: ReturnType<typeof extractUsage>,
): Promise<void> {
  await db.from("ai_usage_events").insert({
    firm_id: firmId,
    feature,
    model: AI_MODEL,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens,
    cache_read_input_tokens: usage.cache_read_input_tokens,
    essay_draft_id: essayDraftId,
    created_by_user_id: createdByUserId,
  });
}

// ---------------------------------------------------------------------------
// Capability 1: Analyze prompt
// ---------------------------------------------------------------------------

export async function analyzePromptForEssay(
  essayId: string,
): Promise<ActionResult<PromptAnalysis>> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = getDb();
  const essay = await loadEssayForFirm(db, essayId, ctx.firmId);
  if (!essay) return { error: "Essay not found" };
  if (!essay.prompt_text?.trim()) {
    return { error: "Add the supplement's prompt text first." };
  }

  const client = getAnthropicClient();
  const response = await client.messages.parse({
    model: AI_MODEL,
    max_tokens: 2000,
    system: [
      {
        type: "text",
        text: PROMPT_ANALYSIS_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Analyze this supplement essay prompt:\n\n"""\n${essay.prompt_text}\n"""`,
      },
    ],
    output_config: { format: zodOutputFormat(promptAnalysisSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    return { error: "Could not analyze the prompt — try again or rephrase." };
  }

  await db
    .from("essay_drafts")
    .update({
      prompt_analysis: parsed,
      prompt_analysis_at: new Date().toISOString(),
      prompt_type: parsed.prompt_type,
      word_count_limit: parsed.word_count_limit,
    })
    .eq("id", essayId)
    .eq("firm_id", ctx.firmId);

  await logUsage(
    db,
    ctx.firmId,
    "prompt_analysis",
    essayId,
    ctx.dbUserId,
    extractUsage(response.usage),
  );

  revalidatePath(`/essays/${essayId}`);
  return { data: parsed };
}

// ---------------------------------------------------------------------------
// Capability 2: Brainstorm angles
// ---------------------------------------------------------------------------

interface StudentProfileBrief {
  first_name: string;
  graduation_year: number | null;
  school_name: string | null;
  academic_interests: string | null;
  extracurricular_summary: string | null;
}

async function loadStudentProfile(
  db: ReturnType<typeof getDb>,
  studentId: string,
  firmId: string,
): Promise<StudentProfileBrief | null> {
  const { data } = await db
    .from("students")
    .select(
      "first_name, graduation_year, school_name, academic_interests, extracurricular_summary",
    )
    .eq("id", studentId)
    .eq("firm_id", firmId)
    .single();
  if (!data) return null;
  return data as StudentProfileBrief;
}

function describeProfile(p: StudentProfileBrief): string {
  const parts: string[] = [];
  parts.push(`First name: ${p.first_name}`);
  if (p.graduation_year) parts.push(`Class of: ${p.graduation_year}`);
  if (p.school_name) parts.push(`High school: ${p.school_name}`);
  if (p.academic_interests) {
    parts.push(`Academic interests: ${p.academic_interests}`);
  }
  if (p.extracurricular_summary) {
    parts.push(`Activities & involvement:\n${p.extracurricular_summary}`);
  }
  return parts.join("\n");
}

export async function brainstormAnglesForEssay(
  essayId: string,
): Promise<ActionResult<BrainstormResult>> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = getDb();
  const essay = await loadEssayForFirm(db, essayId, ctx.firmId);
  if (!essay) return { error: "Essay not found" };
  if (!essay.prompt_text?.trim()) {
    return { error: "Add the prompt text first." };
  }

  const profile = await loadStudentProfile(db, essay.student_id, ctx.firmId);
  if (!profile) return { error: "Student profile not found" };

  const analysisContext = essay.prompt_analysis
    ? `Prompt analysis (from prior analyze step):\n${JSON.stringify(essay.prompt_analysis, null, 2)}`
    : `Note: prompt has not been analyzed yet. Infer the underlying question yourself.`;

  const userPrompt = [
    "PROMPT:",
    essay.prompt_text,
    "",
    analysisContext,
    "",
    "STUDENT PROFILE:",
    describeProfile(profile),
    "",
    "Generate 3-5 distinct candidate angles for this student to develop. Each must draw on something specific from their profile.",
  ].join("\n");

  const client = getAnthropicClient();
  const response = await client.messages.parse({
    model: AI_MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: BRAINSTORM_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
    output_config: { format: zodOutputFormat(brainstormResultSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    return { error: "Could not generate angles — try again." };
  }

  await db.from("essay_ai_suggestions").insert({
    firm_id: ctx.firmId,
    essay_draft_id: essayId,
    kind: "brainstorm",
    content: parsed,
    created_by_user_id: ctx.dbUserId,
  });

  await logUsage(
    db,
    ctx.firmId,
    "brainstorm",
    essayId,
    ctx.dbUserId,
    extractUsage(response.usage),
  );

  revalidatePath(`/essays/${essayId}`);
  return { data: parsed };
}

// ---------------------------------------------------------------------------
// Capability 3: Generate outline
// ---------------------------------------------------------------------------

export async function generateOutlineForEssay(
  essayId: string,
  angleTitle: string,
  angleHook: string,
): Promise<ActionResult<OutlineResult>> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  if (!angleTitle.trim() || !angleHook.trim()) {
    return {
      error: "Pick an angle first (title and opening question are required).",
    };
  }

  const db = getDb();
  const essay = await loadEssayForFirm(db, essayId, ctx.firmId);
  if (!essay) return { error: "Essay not found" };
  if (!essay.prompt_text?.trim()) {
    return { error: "Add the prompt text first." };
  }

  const wordLimit =
    (essay.prompt_analysis as { word_count_limit?: number } | null)
      ?.word_count_limit ?? essay.word_count_target;

  const analysisContext = essay.prompt_analysis
    ? `Prompt analysis (from prior analyze step):\n${JSON.stringify(essay.prompt_analysis, null, 2)}`
    : `Note: prompt has not been analyzed yet. Infer the underlying question yourself.`;

  const userPrompt = [
    "PROMPT:",
    essay.prompt_text,
    "",
    analysisContext,
    "",
    "CHOSEN ANGLE:",
    `Title: ${angleTitle}`,
    `Opening question: ${angleHook}`,
    "",
    wordLimit
      ? `WORD LIMIT: ${wordLimit} words. Distribute word_target across beats so they sum to roughly this limit (hook ~10-15%, body ~60-70%, reflection the rest).`
      : "No word limit was provided. Set word_target to null on every beat.",
    "",
    "Return a purpose question in the thesis field and 4-8 ordered planning questions or instructions covering opening -> development -> reflection. Never supply a thesis sentence, hook, dialogue or drafted essay prose; the student must choose the details and write in their own words.",
  ].join("\n");

  const client = getAnthropicClient();
  const response = await client.messages.parse({
    model: AI_MODEL,
    max_tokens: 3000,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: OUTLINE_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
    output_config: { format: zodOutputFormat(outlineResultSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    return { error: "Could not generate outline — try again." };
  }

  await db.from("essay_ai_suggestions").insert({
    firm_id: ctx.firmId,
    essay_draft_id: essayId,
    kind: "outline",
    content: { ...parsed, chosen_angle_title: angleTitle },
    created_by_user_id: ctx.dbUserId,
  });

  await logUsage(
    db,
    ctx.firmId,
    "outline",
    essayId,
    ctx.dbUserId,
    extractUsage(response.usage),
  );

  revalidatePath(`/essays/${essayId}`);
  return { data: parsed };
}

// ---------------------------------------------------------------------------
// Capability 4 (counselor-only): Coach review
// ---------------------------------------------------------------------------

export async function dismissCoachReviewSuggestion(
  suggestionId: string,
  suggestionIndex: number,
): Promise<{ error?: string; success?: true }> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (!isStaffRole(ctx.role)) {
    return { error: "Coach review is staff-only." };
  }

  const db = getDb();
  const { data: row } = await db
    .from("essay_ai_suggestions")
    .select("id, essay_draft_id, content, kind, firm_id")
    .eq("id", suggestionId)
    .eq("firm_id", ctx.firmId)
    .single();

  if (!row || row.kind !== "coach_review") {
    return { error: "Review not found." };
  }
  try {
    await requireEssayWriteAccess(db, ctx, row.essay_draft_id);
  } catch {
    return { error: "Review not available for editing." };
  }

  const content = row.content as CoachReviewResult & {
    dismissed_suggestion_indices?: number[];
  };
  const dismissed = new Set(content.dismissed_suggestion_indices ?? []);
  dismissed.add(suggestionIndex);

  const { error: updateError } = await db
    .from("essay_ai_suggestions")
    .update({
      content: {
        ...content,
        dismissed_suggestion_indices: Array.from(dismissed).sort(
          (a, b) => a - b,
        ),
      },
    })
    .eq("id", suggestionId)
    .eq("firm_id", ctx.firmId);

  if (updateError) return { error: "Failed to dismiss suggestion." };

  revalidatePath(`/essays/${row.essay_draft_id}`);
  return { success: true };
}
