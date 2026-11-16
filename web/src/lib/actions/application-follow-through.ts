"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { getApplicationFollowThrough } from "../db/queries";
import { resolveUserAndFirm } from "../auth/resolve";
import { requireFollowThroughAccess } from "../auth/application-follow-through";
import { requireTaskResourceAccess } from "../auth/task-access";
import { taskOwnerChoices } from "../auth/task-owner";
import {
  followThroughSchema,
  followThroughSharingSchema,
  followThroughTaskSchema,
  followThroughPath,
} from "../applications/follow-through";
import { revalidateCollegeWorkspaces } from "../colleges/revalidate";
import { AuthorizationError } from "../auth/authorize";

type ActionResult = {
  error?: string;
  data?: Awaited<ReturnType<typeof getApplicationFollowThrough>>;
};

function message(error: unknown) {
  if (error instanceof AuthorizationError)
    return "Application or tracking item not found";
  const text =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : "";
  const safe = [
    "Tracking changed",
    "Follow-up changed",
    "Record submission",
    "Tracking dates",
    "Choose a document",
    "Choose an active owner",
    "An open follow-up",
    "This tracking item",
    "Only the student",
  ];
  return safe.some((prefix) => text.startsWith(prefix))
    ? text
    : "Unable to save follow-through. Refresh and try again.";
}
async function refreshed(applicationId: string) {
  for (const surface of ["staff", "student", "family"] as const)
    revalidatePath(followThroughPath(applicationId, surface));
  for (const path of [
    "/tasks",
    "/student-tasks",
    "/family-tasks",
    "/caseload",
    "/student-dashboard",
    "/family-dashboard",
  ])
    revalidatePath(path);
  revalidateCollegeWorkspaces();
  const data = await getApplicationFollowThrough(applicationId);
  return data ? { data } : { error: "Your access changed. Reload this page." };
}
export async function saveApplicationTracking(
  input: unknown,
): Promise<ActionResult> {
  const parsed = followThroughSchema.safeParse(input);
  if (!parsed.success)
    return {
      error: parsed.error.issues[0]?.message || "Check your tracking details",
    };
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const p = parsed.data,
    db = getDb();
  try {
    const { application, item } = await requireFollowThroughAccess(
      db,
      ctx,
      p.applicationId,
      p.id,
      true,
    );
    if (item && item.revision !== p.revision)
      return {
        error: "Tracking changed in another window. Refresh before saving.",
      };
    if (p.documentId)
      await requireTaskResourceAccess(
        db,
        ctx,
        application.student_id,
        "document",
        p.documentId,
      );
    const values = {
      title: p.title,
      status: p.status,
      sent_on: p.sentOn,
      received_on: p.receivedOn,
      checked_on: p.checkedOn,
      portal_url: p.portalUrl,
      notes: p.notes,
      evidence_document_id: p.documentId,
      updated_by_user_id: ctx.dbUserId,
      revision: p.revision + 1,
    };
    const result = p.id
      ? await db
          .from("application_follow_through_items")
          .update(values)
          .eq("firm_id", ctx.firmId)
          .eq("application_id", p.applicationId)
          .eq("id", p.id)
          .eq("revision", p.revision)
          .select("id")
          .maybeSingle()
      : await db
          .from("application_follow_through_items")
          .insert({
            ...values,
            firm_id: ctx.firmId,
            student_id: application.student_id,
            application_id: p.applicationId,
            kind: p.kind,
            created_by_user_id: ctx.dbUserId,
          })
          .select("id")
          .single();
    if (result.error) {
      if (result.error.code === "23505")
        return {
          error:
            "This receipt or portal is already tracked. Refresh to open it.",
        };
      throw result.error;
    }
    if (!result.data)
      return {
        error: "Tracking changed in another window. Refresh before saving.",
      };
    return await refreshed(p.applicationId);
  } catch (error) {
    return { error: message(error) };
  }
}
export async function shareApplicationTracking(
  input: unknown,
): Promise<ActionResult> {
  const parsed = followThroughSharingSchema.safeParse(input);
  if (!parsed.success) return { error: "Refresh before changing sharing" };
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (ctx.role !== "student")
    return { error: "Only the student can change parent sharing" };
  const p = parsed.data,
    db = getDb();
  try {
    await requireFollowThroughAccess(db, ctx, p.applicationId, p.id, true);
    const result = await db
      .from("application_follow_through_items")
      .update({
        family_shared: p.shared,
        revision: p.revision + 1,
        updated_by_user_id: ctx.dbUserId,
      })
      .eq("firm_id", ctx.firmId)
      .eq("application_id", p.applicationId)
      .eq("id", p.id)
      .eq("revision", p.revision)
      .select("id")
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data)
      return {
        error: "Tracking changed in another window. Refresh before saving.",
      };
    return await refreshed(p.applicationId);
  } catch (error) {
    return { error: message(error) };
  }
}
export async function createApplicationFollowUp(
  input: unknown,
): Promise<ActionResult> {
  const parsed = followThroughTaskSchema.safeParse(input);
  if (!parsed.success)
    return { error: "Choose an owner and a valid follow-up date" };
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const p = parsed.data,
    db = getDb();
  try {
    const { application, item } = await requireFollowThroughAccess(
      db,
      ctx,
      p.applicationId,
      p.id,
      true,
    );
    if (ctx.role === "student") {
      if (p.ownerId !== ctx.dbUserId) throw new AuthorizationError();
    } else {
      const owner = (
        await taskOwnerChoices(db, ctx, application.student_id)
      ).find((o) => o.id === p.ownerId && o.ready);
      if (
        !owner ||
        owner.role === "read_only_staff" ||
        (owner.role === "parent_guardian" && !item?.family_shared)
      )
        return {
          error: "Choose an active owner with access to this tracking item",
        };
    }
    const result = await db.rpc("create_application_follow_up", {
      p_firm: ctx.firmId,
      p_actor: ctx.dbUserId,
      p_item: p.id,
      p_revision: p.revision,
      p_owner: p.ownerId,
      p_due: p.dueOn,
      p_task: p.taskId ?? null,
      p_expected: p.taskRevision ?? null,
    });
    if (result.error) throw result.error;
    return await refreshed(p.applicationId);
  } catch (error) {
    return { error: message(error) };
  }
}
