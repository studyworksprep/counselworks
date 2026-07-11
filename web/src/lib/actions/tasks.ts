"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
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
  TASK_TYPE_VALUES,
  TASK_VISIBILITY_VALUES,
} from "../constants/tasks";

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
      assigned_user_id: (formData.get("assigned_user_id") as string) || ctx.dbUserId,
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

  if (status === "completed") {
    updates.completed_at = new Date().toISOString();
  }

  const db = getDb();

  // Staff need access to the task's student (or to be assignee/creator);
  // students may only complete their own portal-visible tasks.
  try {
    await requireTaskMutation(db, ctx, taskId);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "Task not found" };
    throw e;
  }

  const { error } = await db
    .from("tasks")
    .update(updates)
    .eq("id", taskId)
    .eq("firm_id", ctx.firmId);

  if (error) {
    console.error("Failed to update task:", error);
    return { error: "Failed to update task" };
  }

  if (status === "completed") {
    await completeStepForCompletedTask(db, taskId, {
      dbUserId: ctx.dbUserId,
      firmId: ctx.firmId,
    });
    revalidatePath("/workflows");
  }

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
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
