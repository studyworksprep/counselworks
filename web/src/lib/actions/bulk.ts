"use server";
import { dateOnly } from "../tasks/due-date";

import { resolveTaskOwner } from "../auth/task-owner";
import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm, getAssignedStudentIds } from "../auth/resolve";
import { requireStaff } from "../auth/authorize";
import { TASK_VISIBILITY_VALUES, TASK_PRIORITY_VALUES } from "../constants/tasks";
import { recordAuditEvent } from "../audit";

/**
 * Bulk operations over a student cohort (fix plan 10.8): apply a workflow
 * to many students at once, or create the same task for each of them.
 */

/** Resolve + authorize the cohort: firm-scoped, assignment-scoped, active. */
async function resolveCohort(studentIds: string[]) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" as const };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" as const };
  }
  if (studentIds.length === 0 || studentIds.length > 200) {
    return { error: "Select between 1 and 200 students" as const };
  }

  const db = getDb();
  const scopedIds = await getAssignedStudentIds(ctx);
  const { data: students } = await db
    .from("students")
    .select("id, first_name, last_name")
    .eq("firm_id", ctx.firmId)
    .in("id", studentIds)
    .is("archived_at", null);
  const allowed = (students ?? []).filter(
    (s) => scopedIds === null || scopedIds.includes(s.id)
  );
  if (allowed.length === 0) return { error: "No accessible students" as const };
  return { ctx, db, students: allowed };
}

export async function bulkCreateTasks(
  studentIds: string[],
  formData: FormData
) {
  const resolved = await resolveCohort(studentIds);
  if ("error" in resolved) return resolved;
  const { ctx, db, students } = resolved;

  if (!TASK_PRIORITY_VALUES.has(String(formData.get("priority") || "medium"))) return { error: "Invalid priority" };
  const title = ((formData.get("title") as string) || "").trim();
  if (!title) return { error: "Title is required" };
  const description = ((formData.get("description") as string) || "").trim() || null;
  const dueAt = (formData.get("due_at") as string) || null;
  if(dueAt && !dateOnly.safeParse(dueAt).success) return {error:"Invalid due date"};
  // Explicit audience decision: the bulk form exposes the same visibility
  // control as single-task creation.
  const visibility = (formData.get("visibility_scope") as string) || "staff";
  if (!TASK_VISIBILITY_VALUES.has(visibility)) {
    return { error: "Invalid visibility" };
  }

  let rows;
  try {
  rows = await Promise.all(students.map(async (s) => {
    const owner = await resolveTaskOwner(db, { firmId: ctx.firmId, studentId: s.id, actingUserId: ctx.dbUserId,
      role: String(formData.get("owner_role") || "student") });
    return ({
    firm_id: ctx.firmId,
    title,
    description,
    task_type: "general",
    priority: (formData.get("priority") as string) || "medium",
    status: "pending",
    visibility_scope: visibility,
    assigned_user_id: owner.userId,
    owner_role: owner.role,
    owner_pending: !owner.ready,
    student_id: s.id,
    due_on: dueAt,
    created_by_user_id: ctx.dbUserId,
    updated_by_user_id: ctx.dbUserId,
  }); }));
  } catch { return { error: "Unable to resolve task owners" }; }
  const { error } = await db.from("tasks").insert(rows);
  if (error) {
    console.error("Bulk task creation failed:", error);
    return { error: "Failed to create tasks" };
  }

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "task",
    entityId: ctx.firmId,
    actionType: "task_bulk_created",
    label: `Task "${title}" created for ${rows.length} students`,
  });

  revalidatePath("/students");
  revalidatePath("/tasks");
  return { created: rows.length };
}
