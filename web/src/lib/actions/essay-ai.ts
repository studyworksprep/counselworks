"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { getEssayAiWorkspace } from "../db/queries";
import { resolveUserAndFirm } from "../auth/resolve";
import { AuthorizationError } from "../auth/authorize";
import { requireEssayAiAccess } from "../auth/essay-ai";
import { generateEssayAssistance } from "../ai/essay-assistance";
import {
  ESSAY_ASSISTANCE_MODES,
  selectEssaySources,
} from "../ai/essay-context";
import { contextReferenceSchema } from "../ai/student-context";
import { outlineContentSchema } from "../essays/drafting";
import { revalidateCollegeWorkspaces } from "../colleges/revalidate";

function failure(error: unknown) {
  return {
    error:
      error instanceof AuthorizationError
        ? error.message
        : "Essay assistance is unavailable or its context changed. Your writing and edits are unchanged. Refresh the context or try again later.",
  };
}
function dbFailure(message: string) {
  return {
    error:
      [
        "AI request limit reached; please try again later",
        "Essay or cited context changed; refresh before continuing",
        "Suggestion already used or unavailable",
        "Save an angle and select its confirmed connected material and cited context first",
        "Choose confirmed stories or narratives first",
      ].find((s) => message.includes(s)) ??
      "Unable to save this suggestion. Its sources, assignment or planning work may have changed. Your edits are still here; refresh before trying again.",
  };
}
export async function loadEssayAiAssistance(essayId: string) {
  if (!z.uuid().safeParse(essayId).success) return { error: "Choose an essay" };
  try {
    return { data: await getEssayAiWorkspace(essayId) };
  } catch (error) {
    return failure(error);
  }
}
export async function requestEssayAiAssistance(input: unknown) {
  const parsed = z
    .object({
      essayId: z.uuid(),
      mode: z.enum(ESSAY_ASSISTANCE_MODES),
      taskStamp: z.string().regex(/^[a-f0-9]{32}$/),
      refs: contextReferenceSchema.array().min(1).max(20),
    })
    .safeParse(input);
  if (!parsed.success)
    return { error: "Review the selected sources and assignment first." };
  let pendingId: string | undefined;
  try {
    const ctx = await resolveUserAndFirm();
    if (!ctx) throw new AuthorizationError("Please sign in");
    const db = getDb(),
      p = parsed.data;
    await requireEssayAiAccess(db, ctx, p.essayId);
    const workspace = await getEssayAiWorkspace(p.essayId);
    if (workspace.taskStamp !== p.taskStamp)
      return {
        error: "Essay or planning work changed. Refresh before asking again.",
      };
    if (!workspace.drafting.row.promptText.trim())
      return {
        error: "Add the assigned prompt before asking for planning guidance.",
      };
    if (workspace.drafting.row.promptText.length > 12000)
      return {
        error: "This assigned prompt is too long for planning assistance.",
      };
    let sources;
    try {
      sources = selectEssaySources(workspace.sources, p.refs);
    } catch (error) {
      return { error: (error as Error).message };
    }
    const reservation = await db
      .from("essay_ai_requests")
      .insert({
        firm_id: ctx.firmId,
        owner_user_id: ctx.dbUserId,
        student_id: workspace.drafting.studentId,
        essay_id: p.essayId,
        mode: p.mode,
        source_refs: p.refs,
        task_stamp: p.taskStamp,
      })
      .select("id")
      .single();
    if (reservation.error || !reservation.data)
      return dbFailure(reservation.error?.message ?? "");
    pendingId = reservation.data.id;
    const generated = await generateEssayAssistance(p.mode, workspace, sources);
    // Reauthorize and recheck every source after the provider call. Withdrawing
    // context in flight must suppress its derived output, including fallback DBs.
    await requireEssayAiAccess(db, ctx, p.essayId);
    const latest = await getEssayAiWorkspace(p.essayId);
    selectEssaySources(latest.sources, p.refs);
    if (latest.taskStamp !== p.taskStamp)
      throw new Error("Planning context changed");
    const result = await db
      .from("essay_ai_requests")
      .update({ status: "ready", result: generated.result })
      .eq("firm_id", ctx.firmId)
      .eq("student_id", workspace.drafting.studentId)
      .eq("essay_id", p.essayId)
      .eq("owner_user_id", ctx.dbUserId)
      .eq("id", pendingId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (result.error || !result.data)
      throw new Error("Unable to retain assistance");
    const usage = await db
      .from("ai_usage_events")
      .insert({
        firm_id: ctx.firmId,
        created_by_user_id: ctx.dbUserId,
        feature: `essay_${p.mode}`,
        model: generated.model,
        ...generated.usage,
      });
    if (usage.error)
      console.error("Essay assistance usage could not be recorded");
    return { data: await getEssayAiWorkspace(p.essayId) };
  } catch (error) {
    if (pendingId) {
      const ctx = await resolveUserAndFirm();
      if (ctx)
        await getDb()
          .from("essay_ai_requests")
          .update({ status: "failed" })
          .eq("firm_id", ctx.firmId)
          .eq("owner_user_id", ctx.dbUserId)
          .eq("id", pendingId)
          .eq("status", "pending");
    }
    return failure(error);
  }
}
export async function acceptEssayAiSuggestion(form: FormData) {
  let content: unknown = null;
  try {
    const raw = form.get("content");
    if (typeof raw === "string" && raw) content = JSON.parse(raw);
  } catch {
    return { error: "Check the outline sections." };
  }
  const parsed = z
    .object({
      essayId: z.uuid(),
      requestId: z.uuid(),
      index: z.coerce.number().int().min(0).max(3),
      angle: z.string().trim().max(6000),
      content: outlineContentSchema.nullable(),
    })
    .safeParse({
      essayId: form.get("essay_id"),
      requestId: form.get("request_id"),
      index: form.get("index") ?? 0,
      angle: form.get("angle") ?? "",
      content,
    });
  if (!parsed.success)
    return { error: "Review the suggested angle or outline before saving." };
  try {
    const ctx = await resolveUserAndFirm();
    if (!ctx) throw new AuthorizationError("Please sign in");
    const db = getDb(),
      p = parsed.data;
    await requireEssayAiAccess(db, ctx, p.essayId);
    const workspace = await getEssayAiWorkspace(p.essayId),
      request = workspace.requests.find((r) => r.id === p.requestId);
    if (!request)
      return {
        error:
          "This suggestion is no longer available. Refresh its sources before continuing; your edits are still here.",
      };
    if (
      (request.mode === "story_matches" && !p.angle) ||
      (request.mode === "outline" && !p.content)
    )
      return { error: "Add planning notes before saving." };
    const saved = await db.rpc("accept_essay_ai_suggestion", {
      p_firm: ctx.firmId,
      p_actor: ctx.dbUserId,
      p_request: p.requestId,
      p_index: p.index,
      p_angle: p.angle,
      p_content: p.content,
    });
    if (saved.error) return dbFailure(saved.error.message);
    revalidateCollegeWorkspaces();
    for (const prefix of ["/essays", "/student-essays", "/family-essays"])
      revalidatePath(`${prefix}/${p.essayId}`);
    return { success: true };
  } catch (error) {
    return failure(error);
  }
}
