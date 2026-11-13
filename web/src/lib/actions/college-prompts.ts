"use server";

import { z } from "zod";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import { AuthorizationError, requireCollegeWorkspaceAccess, requireStaff } from "../auth/authorize";
import { revalidateCollegeWorkspaces } from "../colleges/revalidate";
import { requirePromptMaintenance } from "../auth/authorize";
import { promptReviewSchema } from "../colleges/prompt-review";
import { revalidatePath } from "next/cache";

/** An explicit counselor action: null assigns only verified required responses;
 * a prompt id assigns one reviewed optional/conditional response. The RPC locks
 * the list entry, preserves existing writing and rolls back on version failure. */
export async function assignCollegePrompts(studentCollegeId: string, promptId: string | null = null) {
  const input = z.object({ studentCollegeId: z.uuid(), promptId: z.uuid().nullable() })
    .safeParse({ studentCollegeId, promptId });
  if (!input.success) return { error: "Invalid college or prompt" };
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const db = getDb();
  try {
    requireStaff(ctx);
    await requireCollegeWorkspaceAccess(db, ctx, studentCollegeId);
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: "College not found" };
    throw error;
  }
  const { data, error } = await db.rpc("assign_college_prompts", {
    p_firm: ctx.firmId, p_actor: ctx.dbUserId, p_college: studentCollegeId, p_prompt: promptId,
  });
  if (error) {
    console.error("Unable to assign college prompts:", error);
    return { error: "Unable to assign prompts. Check this college's verified coverage and entry year." };
  }
  revalidateCollegeWorkspaces();
  return { assigned: Number(data) };
}

/** Drafts and publications belong to this firm; shared source content is read-only. */
export async function startCollegePromptReview(sourceId: string, entryYear: number) {
  const input = z.object({ sourceId: z.uuid(), entryYear: z.number().int().min(2020).max(2200) }).safeParse({ sourceId, entryYear });
  if (!input.success) return { error: "Choose a source and valid entry year" };
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try { requirePromptMaintenance(ctx); } catch { return { error: "Staff editing access required" }; }
  const { data, error } = await getDb().rpc("start_prompt_review", {
    p_firm: ctx.firmId, p_actor: ctx.dbUserId, p_source: sourceId, p_year: entryYear,
  });
  if (error) {
    console.error("Unable to start prompt review", error);
    return { error: "Unable to create a review. Reload and try again." };
  }
  revalidatePath("/essays/library");
  return { id: String(data) };
}

export async function saveCollegePromptReview(id: string, expected: string, content: unknown) {
  const parsed = promptReviewSchema.safeParse(content);
  if (!z.uuid().safeParse(id).success || !z.iso.datetime({ offset: true }).safeParse(expected).success) return { error: "Invalid review" };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check all review fields" };
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try { requirePromptMaintenance(ctx); } catch { return { error: "Staff editing access required" }; }
  const { error } = await getDb().rpc("save_prompt_review", {
    p_firm: ctx.firmId, p_actor: ctx.dbUserId, p_review: id, p_expected: expected, p_content: parsed.data,
  });
  if (error) {
    console.error("Unable to save prompt review", error);
    return { error: error.message.includes("changed") ? "This review changed in another window. Reload before saving; your unsaved edits are still shown." : "Unable to save this draft. Check the fields and try again." };
  }
  revalidatePath("/essays/library");
  return { success: true };
}

export async function publishCollegePromptReview(id: string, expected: string) {
  if (!z.uuid().safeParse(id).success || !z.iso.datetime({ offset: true }).safeParse(expected).success) return { error: "Invalid review" };
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try { requirePromptMaintenance(ctx, true); } catch { return { error: "Only owners and admins can publish requirements" }; }
  const { error } = await getDb().rpc("publish_prompt_review", {
    p_firm: ctx.firmId, p_actor: ctx.dbUserId, p_review: id, p_expected: expected,
  });
  if (error) {
    console.error("Unable to publish prompt review", error);
    return { error: error.message.includes("changed") ? "This review changed. Reload before publishing." : "Publishing requires a source checked within the last year, a future review date, review evidence, and valid prompt coverage." };
  }
  revalidatePath("/essays/library");
  revalidateCollegeWorkspaces();
  return { success: true };
}
