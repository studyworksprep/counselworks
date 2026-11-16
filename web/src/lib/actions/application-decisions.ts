"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { resolveUserAndFirm } from "../auth/resolve";
import { AuthorizationError } from "../auth/authorize";
import { requireDecisionAccess } from "../auth/application-decisions";
import { taskOwnerChoices } from "../auth/task-owner";
import { requireTaskResourceAccess } from "../auth/task-access";
import { canCounselInterview } from "../auth/interview";
import { getDb } from "../db/client";
import { getApplicationDecisions } from "../db/queries";
import {
  decisionSchema,
  nextStepSchema,
  stepReferenceSchema,
} from "../applications/decisions";
import { followThroughTaskSchema } from "../applications/follow-through";
import { revalidateCollegeWorkspaces } from "../colleges/revalidate";

type ActionResult = {
  error?: string;
  data?: Awaited<ReturnType<typeof getApplicationDecisions>>;
};

function safeError(error: unknown) {
  if (error instanceof AuthorizationError)
    return "Application or next step not found";
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  return [
    "Decision changed",
    "Next step changed",
    "Tracking changed",
    "Follow-up changed",
    "Another college",
    "Choose ",
    "Review this step",
    "Review the step",
    "Only the student",
    "This tracking item",
    "An open follow-up",
    "Completion date",
  ].some((s) => message.startsWith(s))
    ? message
    : "Unable to save. Refresh and try again; your edits are still here.";
}
async function refresh(applicationId: string) {
  revalidateCollegeWorkspaces();
  for (const path of [
    "/tasks",
    "/student-tasks",
    "/family-tasks",
    "/caseload",
    "/reports",
    "/dashboard",
    "/student-dashboard",
    "/family-dashboard",
  ])
    revalidatePath(path);
  const data = await getApplicationDecisions(applicationId);
  return data ? { data } : { error: "Your access changed. Reload this page." };
}
export async function recordApplicationDecision(
  input: unknown,
): Promise<ActionResult> {
  const p = decisionSchema.safeParse(input);
  if (!p.success)
    return { error: p.error.issues[0]?.message || "Check the decision" };
  const ctx = await resolveUserAndFirm();
  if (!ctx || !canCounselInterview(ctx.role))
    return { error: "Only your counseling team can record decisions" };
  try {
    const db = getDb();
    await requireDecisionAccess(db, ctx, p.data.applicationId, undefined, true);
    const r = await db.rpc("record_application_decision", {
      p_firm: ctx.firmId,
      p_actor: ctx.dbUserId,
      p_application: p.data.applicationId,
      p_revision: p.data.revision,
      p_result: p.data.result,
      p_date: p.data.decidedOn,
      p_deposit: p.data.depositStatus || null,
      p_follow_up: p.data.prepareFollowUp,
    });
    if (r.error) throw r.error;
    return await refresh(p.data.applicationId);
  } catch (e) {
    return { error: safeError(e) };
  }
}
export async function saveApplicationNextStep(
  input: unknown,
): Promise<ActionResult> {
  const p = nextStepSchema.safeParse(input);
  if (!p.success)
    return { error: p.error.issues[0]?.message || "Check the next step" };
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    const db = getDb(),
      v = p.data;
    const { application } = await requireDecisionAccess(
      db,
      ctx,
      v.applicationId,
      v.id,
      true,
    );
    if (v.documentId)
      await requireTaskResourceAccess(
        db,
        ctx,
        application.student_id,
        "document",
        v.documentId,
      );
    if (v.essayId)
      await requireTaskResourceAccess(
        db,
        ctx,
        application.student_id,
        "essay",
        v.essayId,
      );
    const values = {
      decision_revision: v.decisionRevision,
      title: v.title,
      status: v.status,
      due_on: v.dueOn,
      completed_on: v.completedOn,
      notes: v.notes,
      essay_id: v.essayId,
      document_id: v.documentId,
      revision: v.revision + 1,
      updated_by_user_id: ctx.dbUserId,
    };
    const r = v.id
      ? await db
          .from("application_next_steps")
          .update(values)
          .eq("firm_id", ctx.firmId)
          .eq("application_id", v.applicationId)
          .eq("id", v.id)
          .eq("revision", v.revision)
          .select("id")
          .maybeSingle()
      : await db
          .from("application_next_steps")
          .insert({
            ...values,
            firm_id: ctx.firmId,
            student_id: application.student_id,
            application_id: v.applicationId,
            kind: v.kind,
            created_by_user_id: ctx.dbUserId,
          })
          .select("id")
          .single();
    if (r.error?.code === "23505") return { error: "This suggested step already exists for the current decision. Open that step to continue; your edits are still here." };
    if (r.error) throw r.error;
    if (!r.data) return { error: "Next step changed. Refresh before saving." };
    return await refresh(v.applicationId);
  } catch (e) {
    return { error: safeError(e) };
  }
}
export async function shareApplicationNextStep(
  input: unknown,
): Promise<ActionResult> {
  const p = stepReferenceSchema
    .extend({ shared: z.boolean() })
    .safeParse(input);
  if (!p.success) return { error: "Refresh before changing sharing" };
  const ctx = await resolveUserAndFirm();
  if (!ctx || ctx.role !== "student")
    return { error: "Only the student can change parent sharing" };
  try {
    const db = getDb(),
      v = p.data;
    await requireDecisionAccess(db, ctx, v.applicationId, v.id, true);
    const r = await db
      .from("application_next_steps")
      .update({
        family_shared: v.shared,
        revision: v.revision + 1,
        updated_by_user_id: ctx.dbUserId,
      })
      .eq("firm_id", ctx.firmId)
      .eq("application_id", v.applicationId)
      .eq("id", v.id)
      .eq("revision", v.revision)
      .select("id")
      .maybeSingle();
    if (r.error) throw r.error;
    if (!r.data) return { error: "Next step changed. Refresh before saving." };
    return await refresh(v.applicationId);
  } catch (e) {
    return { error: safeError(e) };
  }
}
export async function scheduleApplicationNextStep(
  input: unknown,
): Promise<ActionResult> {
  const p = followThroughTaskSchema.safeParse(input);
  if (!p.success)
    return { error: "Choose an owner and a valid follow-up date" };
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    const db = getDb(),
      v = p.data;
    const { application, step } = await requireDecisionAccess(
      db,
      ctx,
      v.applicationId,
      v.id,
      true,
    );
    if (ctx.role === "student") {
      if (v.ownerId !== ctx.dbUserId) throw new AuthorizationError();
    } else {
      const owner = (
        await taskOwnerChoices(db, ctx, application.student_id)
      ).find((o) => o.id === v.ownerId && o.ready);
      if (
        !owner ||
        owner.role === "read_only_staff" ||
        (owner.role === "parent_guardian" && !step?.family_shared)
      )
        return {
          error: "Choose an active owner with access to this next step",
        };
    }
    const r = await db.rpc("schedule_application_next_step", {
      p_firm: ctx.firmId,
      p_actor: ctx.dbUserId,
      p_item: v.id,
      p_revision: v.revision,
      p_owner: v.ownerId,
      p_due: v.dueOn,
      p_task: v.taskId ?? null,
      p_expected: v.taskRevision ?? null,
    });
    if (r.error) throw r.error;
    return await refresh(v.applicationId);
  } catch (e) {
    return { error: safeError(e) };
  }
}
export async function createDecisionLetter(
  input: unknown,
): Promise<ActionResult> {
  const p = stepReferenceSchema.safeParse(input);
  if (!p.success) return { error: "Refresh before creating the letter" };
  const ctx = await resolveUserAndFirm();
  if (!ctx || !canCounselInterview(ctx.role))
    return { error: "Ask your counselor to create the letter draft" };
  try {
    const db = getDb(),
      v = p.data;
    await requireDecisionAccess(db, ctx, v.applicationId, v.id, true);
    const r = await db.rpc("create_decision_letter", {
      p_firm: ctx.firmId,
      p_actor: ctx.dbUserId,
      p_step: v.id,
      p_revision: v.revision,
    });
    if (r.error) throw r.error;
    return await refresh(v.applicationId);
  } catch (e) {
    return { error: safeError(e) };
  }
}
export async function addDecisionChecklist(
  input: unknown,
): Promise<ActionResult> {
  const p = z
    .object({
      applicationId: z.uuid(),
      revision: z.number().int().nonnegative(),
    })
    .safeParse(input);
  if (!p.success) return { error: "Refresh before adding the checklist" };
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    const db = getDb();
    await requireDecisionAccess(db, ctx, p.data.applicationId, undefined, true);
    const r = await db.rpc("initialize_decision_checklist", {
      p_firm: ctx.firmId,
      p_actor: ctx.dbUserId,
      p_application: p.data.applicationId,
      p_revision: p.data.revision,
    });
    if (r.error) throw r.error;
    return await refresh(p.data.applicationId);
  } catch (e) {
    return { error: safeError(e) };
  }
}
