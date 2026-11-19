"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { getEssayCoachingWorkspace } from "../db/queries";
import { resolveUserAndFirm } from "../auth/resolve";
import { requireEssayWriteAccess } from "../auth/essays";
import { AuthorizationError } from "../auth/authorize";
import { selectEssaySources } from "../ai/essay-context";
import { contextReferenceSchema } from "../ai/student-context";
import { generateEssayCoaching } from "../ai/generate-essay-coaching";
import { revalidateCollegeWorkspaces } from "../colleges/revalidate";

const choice = z.object({ essayId: z.uuid(), versionId: z.uuid() });
function failure(error: unknown) {
  return {
    error:
      error instanceof AuthorizationError
        ? error.message
        : "Coaching is unavailable or the saved version, prompt or selected sources changed. Your writing and review edits are unchanged. Review the context or try again later.",
  };
}
export async function loadEssayCoaching(essayId: string, versionId: string) {
  if (!choice.safeParse({ essayId, versionId }).success)
    return { error: "Choose an essay and saved version." };
  try {
    return { data: await getEssayCoachingWorkspace(essayId, versionId) };
  } catch (e) {
    return failure(e);
  }
}
export async function requestEssayCoaching(input: unknown) {
  const parsed = choice
    .extend({
      taskStamp: z.string().regex(/^[a-f0-9]{32}$/),
      refs: contextReferenceSchema.array().min(1).max(20),
    })
    .safeParse(input);
  if (!parsed.success)
    return { error: "Review a saved version and select its context first." };
  let pendingId: string | undefined,
    firmId: string | undefined,
    actorId: string | undefined;
  try {
    const ctx = await resolveUserAndFirm();
    if (!ctx) throw new AuthorizationError("Please sign in");
    firmId = ctx.firmId;
    actorId = ctx.dbUserId;
    const p = parsed.data,
      db = getDb(),
      workspace = await getEssayCoachingWorkspace(p.essayId, p.versionId);
    if (workspace.taskStamp !== p.taskStamp)
      return {
        error:
          "Saved version or prompt changed. Review the context before asking again.",
      };
    if (
      !workspace.version.body.trim() ||
      workspace.version.body.length > 50000 ||
      !workspace.prompt.text.trim() ||
      workspace.prompt.text.length > 12000
    )
      return {
        error:
          "Choose a nonempty saved draft (up to 50,000 characters) and an assigned prompt (up to 12,000 characters). Nothing is truncated.",
      };
    const sources = selectEssaySources(workspace.sources, p.refs);
    const reserved = await db
      .from("essay_coach_requests")
      .insert({
        firm_id: ctx.firmId,
        student_id: workspace.studentId,
        essay_id: p.essayId,
        version_id: p.versionId,
        owner_user_id: ctx.dbUserId,
        source_refs: p.refs,
        task_stamp: p.taskStamp,
      })
      .select("id")
      .single();
    if (reserved.error || !reserved.data)
      return {
        error: reserved.error?.message.includes("AI request limit reached")
          ? "AI request limit reached; please try again later"
          : "Unable to reserve coaching. Review the saved version and selected sources before trying again.",
      };
    pendingId = reserved.data.id;
    const generated = await generateEssayCoaching(workspace, sources);
    const latest = await getEssayCoachingWorkspace(p.essayId, p.versionId);
    selectEssaySources(latest.sources, p.refs);
    if (latest.taskStamp !== p.taskStamp)
      throw new Error("Coaching context changed");
    const ready = await db
      .from("essay_coach_requests")
      .update({ status: "ready", result: generated.result })
      .eq("firm_id", ctx.firmId)
      .eq("owner_user_id", ctx.dbUserId)
      .eq("essay_id", p.essayId)
      .eq("version_id", p.versionId)
      .eq("id", pendingId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (ready.error || !ready.data)
      throw new Error("Unable to retain coaching");
    const usage = await db
      .from("ai_usage_events")
      .insert({
        firm_id: ctx.firmId,
        created_by_user_id: ctx.dbUserId,
        essay_draft_id: p.essayId,
        feature: "essay_saved_version_coaching",
        model: generated.model,
        ...generated.usage,
      });
    if (usage.error) console.error("Coaching usage could not be recorded");
    return { data: await getEssayCoachingWorkspace(p.essayId, p.versionId) };
  } catch (e) {
    if (pendingId && firmId && actorId)
      await getDb()
        .from("essay_coach_requests")
        .update({ status: "failed" })
        .eq("firm_id", firmId)
        .eq("owner_user_id", actorId)
        .eq("id", pendingId)
        .eq("status", "pending");
    return failure(e);
  }
}
export async function publishEssayCoaching(form: FormData) {
  const parsed = choice
    .extend({
      requestId: z.uuid(),
      index: z.coerce.number().int().min(0).max(7),
      body: z.string().trim().min(1).max(12000),
    })
    .safeParse({
      essayId: form.get("essay_id"),
      versionId: form.get("version_id"),
      requestId: form.get("request_id"),
      index: form.get("index"),
      body: form.get("body"),
    });
  if (!parsed.success)
    return { error: "Review the feedback and saved passage before adding it." };
  try {
    const ctx = await resolveUserAndFirm();
    if (!ctx) throw new AuthorizationError("Please sign in");
    const p = parsed.data,
      db = getDb();
    await requireEssayWriteAccess(db, ctx, p.essayId);
    const workspace = await getEssayCoachingWorkspace(p.essayId, p.versionId),
      request = workspace.requests.find((r) => r.id === p.requestId);
    if (
      !request ||
      request.used.includes(p.index) ||
      !request.result.suggestions[p.index]
    )
      return {
        error:
          "This suggestion was already used or its context changed. Your edited feedback is still here.",
      };
    const saved = await db.rpc("publish_essay_coaching", {
      p_firm: ctx.firmId,
      p_actor: ctx.dbUserId,
      p_request: p.requestId,
      p_index: p.index,
      p_body: p.body,
    });
    if (saved.error)
      return {
        error:
          "Unable to add this feedback. Its sources or saved version may have changed, or it was already added. Your edits are still here.",
      };
    revalidateCollegeWorkspaces();
    revalidatePath(`/essays/${p.essayId}`);
    revalidatePath(`/student-essays/${p.essayId}`);
    return { success: true };
  } catch (e) {
    return failure(e);
  }
}
