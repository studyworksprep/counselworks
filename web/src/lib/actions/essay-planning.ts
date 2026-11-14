"use server";

import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import { AuthorizationError } from "../auth/authorize";
import { requireEssayPlanningWrite } from "../auth/essay-planning";
import { essayPlanSchema } from "../essays/planning";
import { revalidateCollegeWorkspaces } from "../colleges/revalidate";
import { revalidatePath } from "next/cache";

function value(form: FormData, key: string) { const v = form.get(key); return typeof v === "string" ? v : ""; }
export async function saveEssayPlan(form: FormData) {
  let sourceVersions: unknown;
  try { sourceVersions = JSON.parse(value(form, "source_versions")); } catch { return { error: "Reload the board to review the current connected material. Your edits are still here." }; }
  const input = essayPlanSchema.safeParse({ studentId: value(form, "student_id"), essayId: value(form, "essay_id"), revision: Number(value(form, "revision")),
    expectedLinks: form.getAll("expected_link"), entryIds: form.getAll("entry_id"), sourceVersions, approach: value(form, "approach"), angle: value(form, "angle"),
    reviewState: value(form, "review_state"), familyShared: value(form, "family_shared") === "yes" });
  if (!input.success) return { error: "Check the plan fields and choose up to 20 distinct stories or narratives." };
  const p = input.data;
  try {
    const ctx = await resolveUserAndFirm(); if (!ctx) throw new AuthorizationError("Please sign in");
    const db = getDb(); await requireEssayPlanningWrite(db, ctx, p.studentId, p.essayId);
    if (ctx.role !== "student" && (p.reviewState !== "draft" || p.familyShared)) return { error: "The student confirms the plan and approves parent sharing." };
    if (p.familyShared && p.reviewState !== "confirmed") return { error: "Confirm the current plan before sharing its note with parents." };
    const { error } = await db.rpc("save_essay_plan", { p_firm: ctx.firmId, p_actor: ctx.dbUserId, p_essay: p.essayId, p_revision: p.revision,
      p_expected_links: p.expectedLinks, p_entry_ids: p.entryIds, p_source_versions: p.sourceVersions, p_approach: p.approach, p_angle: p.angle, p_review: p.reviewState, p_family: p.familyShared });
    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("changed in another window")) return { error: "This plan or its connected material changed in another window. Your text is still here; reload before saving again." };
      if (message.includes("shared with family")) return { error: "The essay and every connected story or narrative must be shared with family before sharing the plan note." };
      if (message.includes("confirm connected") || message.includes("approach") || message.includes("connected stories")) return { error: "Choose an approach, add an angle, and confirm your connected material before marking this plan reviewed. Experience responses need at least one story or narrative." };
      console.error("Essay plan save failed", error.code);
      return { error: "Unable to save this plan. Check your access and connected material, then reload before trying again." };
    }
    revalidateCollegeWorkspaces();
    for (const path of [`/students/${p.studentId}/interview`, "/student-interview", `/family-interview/${p.studentId}`]) revalidatePath(path);
    return { success: true };
  } catch (error) {
    if (error instanceof AuthorizationError) return { error: error.message };
    console.error("Essay planning unavailable", error instanceof Error ? error.message : "Database operation");
    return { error: "Unable to save. Your edits are still here. Please try again." };
  }
}
