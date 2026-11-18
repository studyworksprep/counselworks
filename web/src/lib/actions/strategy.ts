"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { getInterviewWorkspace } from "../db/queries";
import { resolveUserAndFirm } from "../auth/resolve";
import { AuthorizationError } from "../auth/authorize";
import { requireStrategyAccess } from "../auth/strategy";
import { strategyReviewSchema, strategySectionSchema, strategySourceKey, strategySourcesCurrent, strategySourcesVisible, type StrategyReference } from "../interview/strategy";

function value(form: FormData, key: string) { const v = form.get(key); return typeof v === "string" ? v : ""; }
function refresh(studentId: string) {
  for (const path of [`/students/${studentId}/interview`, "/student-interview", `/family-interview/${studentId}`]) revalidatePath(path);
}
function failure(error: unknown) {
  if (error instanceof AuthorizationError) return { error: error.message };
  console.error("Strategy brief save failed", error instanceof Error ? error.message : "Database operation");
  return { error: "Unable to save the strategy brief. Your text is still here. Reload to check for changes." };
}
function savedError(error: { code?: string } | null, changed: boolean) {
  if (error?.code === "23505" || (!error && !changed)) return { error: "This section changed in another window. Your text is still here; reload before saving again." };
  if (error) return { error: "Unable to save. Check your access and linked sources, then reload before trying again." };
  return null;
}
export async function saveStrategySection(form: FormData) {
  const input = strategySectionSchema.safeParse({ studentId: value(form, "student_id"), id: value(form, "id") || undefined,
    sectionKey: value(form, "section_key"), body: value(form, "body"), publicationState: value(form, "publication_state"),
    sourceKeys: form.getAll("source_key"), revision: Number(value(form, "revision")) });
  if (!input.success) return { error: "Add your brief section and check its sharing and linked sources." };
  const p = input.data;
  if (new Set(p.sourceKeys).size !== p.sourceKeys.length) return { error: "Choose each source once." };
  if ((!p.id || p.sectionKey === "counselor_notes") && p.publicationState !== "draft") return { error: "Save a counselor-only draft first. Private counselor notes can never be shared." };
  try {
    const ctx = await resolveUserAndFirm(); if (!ctx) throw new AuthorizationError("Please sign in");
    const db = getDb(); await requireStrategyAccess(db, ctx, p.studentId, "edit");
    const data = await getInterviewWorkspace(p.studentId); if (!data) throw new AuthorizationError("Strategy brief not available");
    const previous = data.strategySections.find(s => s.id === p.id && s.section_key === p.sectionKey);
    if (p.id && !previous) return { error: "Strategy section not found" };
    const available: StrategyReference[] = [...data.answers.map(a => ({ kind: "answer" as const, id: a.id, revision: a.revision })), ...data.entries.map(e => ({ kind: "bank" as const, id: e.id, revision: e.revision }))];
    const evidence = p.sourceKeys.map(key => available.find(s => strategySourceKey(s) === key));
    if (evidence.some(s => !s)) return { error: "Choose current interview responses or stories for this student." };
    const refs = evidence as StrategyReference[];
    if (p.publicationState === "shared" && !strategySourcesVisible(refs, data, "student")) return { error: "A linked parent response is private. Keep this section counselor-only, or remove that source and any private information before sharing." };
    const changes = { body: p.body, evidence: refs, publication_state: p.publicationState, updated_by_user_id: ctx.dbUserId,
      revision: p.revision + 1, student_review: "pending", student_note: previous?.student_note ?? "", family_shared: false, reviewed_at: previous?.reviewed_at ?? null };
    const result = p.id ? await db.from("student_strategy_sections").update(changes).eq("firm_id", ctx.firmId).eq("student_id", p.studentId).eq("id", p.id).eq("section_key", p.sectionKey).eq("revision", p.revision).select("id").maybeSingle() :
      await db.from("student_strategy_sections").insert({ ...changes, firm_id: ctx.firmId, student_id: p.studentId, section_key: p.sectionKey, created_by_user_id: ctx.dbUserId }).select("id").single();
    const error = savedError(result.error, !!result.data); if (error) return error;
    refresh(p.studentId); return { success: true };
  } catch (error) { return failure(error); }
}

export async function reviewStrategySection(form: FormData) {
  const input = strategyReviewSchema.safeParse({ studentId: value(form, "student_id"), id: value(form, "id"), revision: Number(value(form, "revision")), review: value(form, "student_review"), note: value(form, "student_note"), familyShared: value(form, "family_shared") === "yes" });
  if (!input.success) return { error: "Check your review and parent-sharing choices." };
  const p = input.data;
  try {
    const ctx = await resolveUserAndFirm(); if (!ctx) throw new AuthorizationError("Please sign in");
    const db = getDb(); await requireStrategyAccess(db, ctx, p.studentId, "review");
    const data = await getInterviewWorkspace(p.studentId);
    const section = data?.strategySections.find(s => s.id === p.id && s.publication_state === "shared");
    if (!data || !section) return { error: "This section is no longer shared with you. Your note is still here." };
    if (p.review === "accurate" && !strategySourcesCurrent(section.evidence, data)) return { error: "Ask your counselor to refresh the changed sources before confirming this section." };
    if (p.familyShared && (p.review !== "accurate" || !strategySourcesVisible(section.evidence, data, "family") || !strategySourcesCurrent(section.evidence, data))) return { error: "Confirm this section and share each linked response or story before sharing it with parents." };
    const result = await db.from("student_strategy_sections").update({ student_review: p.review, student_note: p.note, family_shared: p.familyShared,
      reviewed_at: p.review === "pending" ? null : new Date().toISOString(), updated_by_user_id: ctx.dbUserId, revision: p.revision + 1 })
      .eq("firm_id", ctx.firmId).eq("student_id", p.studentId).eq("id", p.id).eq("publication_state", "shared").eq("revision", p.revision).select("id").maybeSingle();
    const error = savedError(result.error, !!result.data); if (error) return error;
    refresh(p.studentId); return { success: true };
  } catch (error) { return failure(error); }
}
