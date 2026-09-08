"use server";

import { resolveTaskOwner, taskOwnerChoices } from "../auth/task-owner";
import { z } from "zod";
import { requireTaskReadAccess, requireTaskResourceAccess } from "../auth/task-access";
import { TASK_RESOURCE_KINDS, taskPath } from "../constants/task-links";
import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm, isStaffRole } from "../auth/resolve";
import {
  AuthorizationError,
  requireStaff,
  requireTaskMutation,
} from "../auth/authorize";
import {
  completeStepForCompletedTask,
  unlinkTaskFromAnyStep,
} from "../workflows/tasks-sync";
import {
  TASK_PRIORITY_VALUES,
  taskTransitionAllowed,
  TASK_TYPE_VALUES,
  TASK_VISIBILITY_VALUES,
} from "../constants/tasks";

const taskResourceSelection = z.tuple([z.enum(TASK_RESOURCE_KINDS), z.string().uuid()]).nullable();
function revalidateTaskDetail(id: string) {
  for (const surface of ["staff", "student", "family"] as const) revalidatePath(taskPath(id, surface));
}

export async function createTask(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const title = formData.get("title") as string;
  if (!title) return { error: "Title is required" };

  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  if (!TASK_PRIORITY_VALUES.has(String(formData.get("priority") || "medium"))) return { error: "Invalid priority" };

  const taskType = (formData.get("task_type") as string) || "general";
  if (!TASK_TYPE_VALUES.has(taskType)) {
    return { error: "Invalid task type" };
  }

  // Explicit audience decision: the form's visibility control drives who
  // sees this task (staff / student portal / both portals).
  const visibility = (formData.get("visibility_scope") as string) || "staff";
  if (!TASK_VISIBILITY_VALUES.has(visibility)) {
    return { error: "Invalid visibility" };
  }
  const studentId = (formData.get("student_id") as string) || null;
  if (visibility !== "staff" && !studentId) {
    return { error: "Portal-visible tasks must be linked to a student" };
  }

  const db = getDb();
  let owner;
  try {
    owner = await resolveTaskOwner(db, { firmId: ctx.firmId, studentId, actingUserId: ctx.dbUserId,
      role: String(formData.get("owner_role") || (studentId ? "student" : ctx.role)),
      userId: String(formData.get("assigned_user_id") || "") || (studentId ? null : ctx.dbUserId) });
  } catch (e) { return { error: e instanceof Error ? e.message : "Unable to resolve owner" }; }
  const { data, error } = await db
    .from("tasks")
    .insert({
      firm_id: ctx.firmId,
      title,
      description: (formData.get("description") as string) || null,
      task_type: taskType,
      priority: (formData.get("priority") as string) || "medium",
      status: "pending",
      visibility_scope: visibility,
      assigned_user_id: owner.userId,
      owner_role: owner.role,
      owner_pending: !owner.ready,
      student_id: studentId,
      due_at: (formData.get("due_at") as string) || null,
      created_by_user_id: ctx.dbUserId,
      updated_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create task:", error);
    return { error: "Failed to create task" };
  }

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  // Student/family-visible tasks render in the portal lists too (rule 2:
  // every persona's surface must repaint, not just the caller's).
  revalidatePath("/student-tasks");
  revalidatePath("/family-tasks");
  return { id: data.id };
}

export async function updateTaskStatus(taskId: string, status: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const updates: Record<string, unknown> = {
    status,
    updated_by_user_id: ctx.dbUserId,
    updated_at: new Date().toISOString(),
  };

  updates.completed_at = status === "completed" ? new Date().toISOString() : null;

  const db = getDb();

  // Staff need current access to the task's student;
  // portal users may only complete their own portal-visible tasks.
  let priorStatus: string;
  try {
    const task = await requireTaskMutation(db, ctx, taskId);
    priorStatus = task.status;
    if (!taskTransitionAllowed(task.status, status, !isStaffRole(ctx.role), task.task_type)) {
      return { error: "This status change is not allowed" };
    }
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "Task not found" };
    throw e;
  }

  const { error } = await db
    .from("tasks")
    .update(updates)
    .eq("id", taskId)
    .eq("status", priorStatus)
    .is("archived_at", null)
    .eq("firm_id", ctx.firmId).select("id").single();

  if (error) {
    console.error("Failed to update task:", error);
    return { error: "Failed to update task" };
  }

  if (status === "completed") {
    const sync = await completeStepForCompletedTask(db, taskId, {
      dbUserId: ctx.dbUserId,
      firmId: ctx.firmId,
    });
    if (sync.error) return { error: "Task saved, but workflow advancement failed. Retry completion." };
    revalidatePath("/workflows");
  }

  revalidateTaskDetail(taskId);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  // Students complete their own tasks from /student-tasks — without this the
  // caller's own page never repaints and the Mark complete button cannot
  // flip (golden-path step 6). Parents and the portal dashboards render
  // task status / workflow progress too.
  revalidatePath("/student-tasks");
  revalidatePath("/family-tasks");
  revalidatePath("/student-dashboard");
  revalidatePath("/family-dashboard");
  return { success: true };
}

export async function deleteTask(taskId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const db = getDb();
  try { await requireTaskMutation(db, ctx, taskId, true); }
  catch { return { error: "Task not found" }; }
  const { error } = await db
    .from("tasks")
    .update({
      archived_at: new Date().toISOString(),
      updated_by_user_id: ctx.dbUserId,
    })
    .eq("id", taskId)
    .eq("firm_id", ctx.firmId);

  if (error) return { error: "Failed to delete task" };

  await unlinkTaskFromAnyStep(db, taskId);

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  // Portal-visible tasks disappear from the portal lists too (rule 2).
  revalidatePath("/student-tasks");
  revalidatePath("/family-tasks");
  return { success: true };
}

/**
 * Student-portal personal tasks: always the student's own, always
 * student-scoped (visible to them and their counselors; deliberate default —
 * parents see only counselor-assigned family-scope tasks).
 */
export async function createStudentPortalTask(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (ctx.role !== "student") return { error: "Not authorized" };

  const title = ((formData.get("title") as string) || "").trim();
  if (!title) return { error: "Title is required" };

  const db = getDb();
  const { data: student } = await db
    .from("students")
    .select("id")
    .eq("firm_id", ctx.firmId)
    .eq("user_id", ctx.dbUserId)
    .limit(1)
    .maybeSingle();
  if (!student) return { error: "No student record linked to your account" };

  const { error } = await db.from("tasks").insert({
    firm_id: ctx.firmId,
    title,
    description: null,
    task_type: "general",
    priority: "medium",
    status: "pending",
    visibility_scope: "student",
    assigned_user_id: ctx.dbUserId,
    student_id: student.id,
    due_at: (formData.get("due_at") as string) || null,
    created_by_user_id: ctx.dbUserId,
    updated_by_user_id: ctx.dbUserId,
  });
  if (error) {
    console.error("Failed to create portal task:", error);
    return { error: "Failed to create task" };
  }

  revalidatePath("/student-tasks");
  return { success: true };
}

export async function getTaskOwnerChoices(studentId: string | null) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated", choices: [] };
  try { return { choices: await taskOwnerChoices(getDb(), ctx, studentId) }; }
  catch { return { error: "Unable to load eligible owners", choices: [] }; }
}

/** Explicitly publish a saved task after choosing a linked, eligible owner. */
export async function resolvePendingTaskOwner(taskId: string, userId: string | null) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const db = getDb();
  try {
    requireStaff(ctx);
    const { data: task, error } = await db.from("tasks").select("student_id, owner_role, assigned_user_id")
      .eq("firm_id", ctx.firmId).eq("id", taskId).eq("owner_pending", true).is("archived_at", null).single();
    if (error || !task) return { error: "Pending task not found" };
    const owner = await resolveTaskOwner(db, { firmId: ctx.firmId, studentId: task.student_id,
      actingUserId: ctx.dbUserId, role: task.owner_role, userId: userId || task.assigned_user_id });
    if (!owner.ready) return { error: "Choose a linked owner first. Use the student workspace invitation flow if portal access is missing." };
    const result = await db.from("tasks").update({ assigned_user_id: owner.userId, owner_role: owner.role,
      owner_pending: false, updated_by_user_id: ctx.dbUserId }).eq("firm_id", ctx.firmId).eq("id", taskId).eq("owner_pending", true);
    if (result.error) return { error: "Unable to publish task" };
    const linked = await db.from("student_workflow_steps").update({ assigned_user_id: owner.userId })
      .eq("linked_task_id", taskId);
    if (linked.error) return { error: "Task published, but workflow owner sync failed. Contact your administrator." };
    for (const path of ["/tasks", "/student-tasks", "/family-tasks", "/student-dashboard", "/family-dashboard"]) revalidatePath(path);
    if (task.student_id) revalidatePath(`/students/${task.student_id}/tasks`);
    return { success: true };
  } catch { return { error: "Unable to resolve this task's owner" }; }
}

export async function linkTaskResource(taskId: string, formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const db = getDb();
  try {
    requireStaff(ctx);
    const { task } = await requireTaskReadAccess(db, ctx, taskId);
    const selection = String(formData.get("resource") || "");
    const parsed = taskResourceSelection.safeParse(selection ? selection.split(":") : null);
    if (!parsed.success) return { error: "Choose valid linked work" };
    const [kind, id] = parsed.data ?? [null, null];
    if (kind && id) await requireTaskResourceAccess(db, ctx, task.student_id, kind, id);
    const { error } = await db.from("tasks").update({ related_entity_type: kind, related_entity_id: id,
      application_id: !kind ? null : kind === "application" ? id : task.application_id, updated_by_user_id: ctx.dbUserId })
      .eq("firm_id", ctx.firmId).eq("id", taskId).is("archived_at", null).select("id").single();
    if (error) return { error: "Unable to save linked work" };
    revalidateTaskDetail(taskId);
    return { success: true };
  } catch (error) { return { error: error instanceof AuthorizationError ? "Task or work is not accessible" : "Unable to save linked work" }; }
}
