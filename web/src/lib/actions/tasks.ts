"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import {
  completeStepForCompletedTask,
  unlinkTaskFromAnyStep,
} from "../workflows/tasks-sync";

export async function createTask(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const title = formData.get("title") as string;
  if (!title) return { error: "Title is required" };

  const db = createServerClient();
  const { data, error } = await db
    .from("tasks")
    .insert({
      firm_id: ctx.firmId,
      title,
      description: (formData.get("description") as string) || null,
      task_type: (formData.get("task_type") as string) || "general",
      priority: (formData.get("priority") as string) || "medium",
      status: "pending",
      visibility_scope: "staff",
      assigned_user_id: (formData.get("assigned_user_id") as string) || ctx.dbUserId,
      student_id: (formData.get("student_id") as string) || null,
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

  const db = createServerClient();
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

  const db = createServerClient();
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
