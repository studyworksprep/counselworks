"use server";

import { revalidatePath } from "next/cache";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AI_MODEL, extractUsage, getAnthropicClient } from "../ai/client";
import { PROMPT_ANALYSIS_SYSTEM } from "../ai/prompts";
import {
  promptAnalysisSchema,
  type CoachReviewResult,
  type PromptAnalysis,
} from "../ai/schemas";
import { requireEssayWriteAccess } from "../auth/essays";
import { isStaffRole, resolveUserAndFirm } from "../auth/resolve";
import { getDb } from "../db/client";

type ActionResult<T> = { error: string } | { data: T };

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
  if (!isStaffRole(ctx.role)) {
    return { error: "Prompt analysis is available to the counseling team." };
  }

  const db = getDb();
  try {
    await requireEssayWriteAccess(db, ctx, essayId);
  } catch {
    return { error: "Essay not available for editing." };
  }
  const { data: essay } = await db
    .from("essay_drafts")
    .select("prompt_text")
    .eq("id", essayId)
    .eq("firm_id", ctx.firmId)
    .single();
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
// Earlier staff coach reviews (no generation)
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
