"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { getStudentAiWorkspace } from "../db/queries";
import { resolveUserAndFirm } from "../auth/resolve";
import { AuthorizationError } from "../auth/authorize";
import { requireStudentAiAccess } from "../auth/student-ai";
import { generateInterviewAssistance } from "../ai/interview-assistance";
import { ASSISTANCE_MODES, contextReferenceSchema, selectStudentContext, assistanceQuestions } from "../ai/student-context";

function refresh(studentId: string) {
  for (const path of [`/students/${studentId}/interview`, "/student-interview", `/family-interview/${studentId}`]) revalidatePath(path);
}
function failure(error: unknown) {
  if (error instanceof AuthorizationError) return { error: error.message };
  // Never log prompts, student text, provider bodies or credentials.
  return { error: "AI assistance is unavailable. Your answers and writing are unchanged. Refresh the context or try again later." };
}
function dbError(message: string) {
  return ["AI request limit reached; please try again later", "AI context changed; refresh before continuing", "Strategy brief changed; refresh before saving", "Refresh existing strategy sources first", "Suggestion already used or unavailable", "Review the strategy section directly; it has too many sources to append"].find(m => message.includes(m))
    ?? "Unable to save this suggestion. Refresh to check its sources and your access; your edits are still here.";
}
export async function loadStudentAiAssistance(studentId: string, recipientId: string) {
  if (!z.uuid().safeParse(studentId).success || !z.uuid().safeParse(recipientId).success) return { error: "Choose an interview respondent" };
  try { return { data: await getStudentAiWorkspace(studentId,recipientId) }; } catch (error) { return failure(error); }
}
export async function requestStudentAiAssistance(input: unknown) {
  const parsed = z.object({ studentId: z.uuid(), recipientId: z.uuid(), mode: z.enum(ASSISTANCE_MODES), stage: z.number().int().min(1).max(3), refs: z.array(contextReferenceSchema).max(20) }).safeParse(input);
  if (!parsed.success) return { error: "Check the selected sources and interview stage." };
  const p = parsed.data;
  let pendingId: string | undefined;
  try {
    const ctx = await resolveUserAndFirm(); if (!ctx) throw new AuthorizationError("Please sign in");
    const db = getDb(); await requireStudentAiAccess(db,ctx,p.studentId,p.recipientId,p.mode);
    const { context } = await getStudentAiWorkspace(p.studentId,p.recipientId);
    let sources;
    try { sources = selectStudentContext(context,p.mode,p.refs); } catch (error) { return { error: (error as Error).message }; }
    const questions = assistanceQuestions(context,p.stage);
    if (p.mode === "questions" && !questions.length) return { error: "There are no available questions in this stage. Skipped and counselor-discussion questions stay excluded." };
    const reservation = await db.from("student_ai_requests").insert({ firm_id: ctx.firmId, student_id: p.studentId, owner_user_id: ctx.dbUserId,
      recipient_user_id: p.recipientId, mode: p.mode, source_refs: p.refs }).select("id").single();
    if (reservation.error || !reservation.data) return { error: dbError(reservation.error?.message ?? "") };
    pendingId = reservation.data.id;
    const generated = await generateInterviewAssistance(p.mode,context,sources,questions);
    // Source withdrawal, respondent changes and assignment changes during the
    // model call must prevent returning or saving its derived text.
    await requireStudentAiAccess(db,ctx,p.studentId,p.recipientId,p.mode);
    const latest = await getStudentAiWorkspace(p.studentId,p.recipientId);
    selectStudentContext(latest.context,p.mode,p.refs);
    if (p.mode === "questions" && generated.result.items.some(i => !assistanceQuestions(latest.context,p.stage).some(q => q.key === i.questionKey))) throw new Error("Question boundary changed");
    const saved = await db.from("student_ai_requests").update({ status: "ready", result: generated.result }).eq("firm_id",ctx.firmId).eq("owner_user_id",ctx.dbUserId).eq("id",pendingId).eq("status","pending").select("id").maybeSingle();
    if (saved.error || !saved.data) throw new Error("AI result could not be saved");
    const usage = await db.from("ai_usage_events").insert({ firm_id: ctx.firmId, created_by_user_id: ctx.dbUserId, feature: `interview_${p.mode}`, model: generated.model, ...generated.usage });
    if (usage.error) console.error("Interview AI usage could not be recorded");
    refresh(p.studentId);
    return { data: await getStudentAiWorkspace(p.studentId,p.recipientId) };
  } catch (error) {
    if (pendingId) {
      const ctx = await resolveUserAndFirm();
      if (ctx) await getDb().from("student_ai_requests").update({status:"failed"}).eq("firm_id",ctx.firmId).eq("owner_user_id",ctx.dbUserId).eq("id",pendingId).eq("status","pending");
    }
    return failure(error);
  }
}
export async function acceptStudentAiSuggestion(form: FormData) {
  const p = z.object({ studentId: z.uuid(), recipientId: z.uuid(), requestId: z.uuid(), index: z.coerce.number().int().min(0).max(3), title: z.string().trim().min(1).max(160), body: z.string().trim().min(1).max(3000), revision: z.coerce.number().int().min(0) }).safeParse({
    studentId: form.get("student_id"), recipientId: form.get("recipient_id"), requestId: form.get("request_id"), index: form.get("index"), title: form.get("title"), body: form.get("body"), revision: form.get("section_revision") ?? 0,
  });
  if (!p.success) return { error: "Review the suggestion and text before saving." };
  try {
    const ctx = await resolveUserAndFirm(); if (!ctx) throw new AuthorizationError("Please sign in");
    const db = getDb(), input = p.data;
    const workspace = await getStudentAiWorkspace(input.studentId,input.recipientId);
    const request = workspace.requests.find(r => r.id === input.requestId);
    if (!request) return { error: "Suggestion no longer available. Refresh the context." };
    await requireStudentAiAccess(db,ctx,input.studentId,input.recipientId,request.mode);
    const result = await db.rpc("accept_student_ai_suggestion", { p_firm: ctx.firmId, p_actor: ctx.dbUserId, p_request: input.requestId, p_index: input.index,
      p_title: input.title, p_body: input.body, p_section_revision: input.revision });
    if (result.error) return { error: dbError(result.error.message) };
    refresh(input.studentId);return { success: true };
  } catch (error) { return failure(error); }
}
export async function dismissStudentAiAssistance(studentId: string, recipientId: string, requestId: string) {
  if (![studentId,recipientId,requestId].every(id => z.uuid().safeParse(id).success)) return {error:"Invalid suggestion"};
  try {
    const ctx = await resolveUserAndFirm(); if (!ctx) throw new AuthorizationError("Please sign in");
    const db = getDb(); await requireStudentAiAccess(db,ctx,studentId,recipientId);
    const result = await db.from("student_ai_requests").update({status:"dismissed"}).eq("firm_id",ctx.firmId).eq("student_id",studentId)
      .eq("owner_user_id",ctx.dbUserId).eq("recipient_user_id",recipientId).eq("id",requestId).eq("status","ready").select("id").maybeSingle();
    if (result.error || !result.data) return {error:"Suggestion no longer available. Refresh the context."};
    return {success:true};
  } catch(error) { return failure(error); }
}
