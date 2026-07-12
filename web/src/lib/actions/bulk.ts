"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm, getAssignedStudentIds } from "../auth/resolve";
import { requireStaff } from "../auth/authorize";
import { instantiateWorkflowFromTemplate } from "@/modules/workflows/service";
import { materializeTasksForNewWorkflow } from "../workflows/tasks-sync";
import { TASK_VISIBILITY_VALUES } from "../constants/tasks";
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

export async function bulkApplyWorkflow(
  studentIds: string[],
  templateId: string
) {
  const resolved = await resolveCohort(studentIds);
  if ("error" in resolved) return resolved;
  const { ctx, db, students } = resolved;

  const { data: template } = await db
    .from("workflow_templates")
    .select("id, name")
    .eq("id", templateId)
    .or(`firm_id.eq.${ctx.firmId},is_system_template.eq.true`)
    .maybeSingle();
  if (!template) return { error: "Workflow template not found" };

  // Skip students who already have an active instance of this template —
  // re-running a bulk apply must not double-assign.
  const { data: existing } = await db
    .from("student_workflows")
    .select("student_id")
    .eq("firm_id", ctx.firmId)
    .eq("workflow_template_id", templateId)
    .in("status", ["not_started", "in_progress"])
    .in(
      "student_id",
      students.map((s) => s.id)
    );
  const alreadyAssigned = new Set((existing ?? []).map((w) => w.student_id));

  let applied = 0;
  let failed = 0;
  for (const student of students) {
    if (alreadyAssigned.has(student.id)) continue;
    const { data: workflow, error } = await instantiateWorkflowFromTemplate(
      db,
      {
        firmId: ctx.firmId,
        studentId: student.id,
        templateId,
        startDate: new Date(),
        createdByUserId: ctx.dbUserId,
      }
    );
    if (error || !workflow) {
      failed++;
      continue;
    }
    await materializeTasksForNewWorkflow(db, workflow.id, {
      dbUserId: ctx.dbUserId,
      firmId: ctx.firmId,
    });
    applied++;
  }

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "workflow_template",
    entityId: templateId,
    actionType: "workflow_bulk_applied",
    label: `Workflow "${template.name}" applied to ${applied} students`,
  });

  revalidatePath("/students");
  revalidatePath("/workflows");
  revalidatePath("/tasks");
  return {
    applied,
    skipped: alreadyAssigned.size,
    failed,
  };
}

export async function bulkCreateTasks(
  studentIds: string[],
  formData: FormData
) {
  const resolved = await resolveCohort(studentIds);
  if ("error" in resolved) return resolved;
  const { ctx, db, students } = resolved;

  const title = ((formData.get("title") as string) || "").trim();
  if (!title) return { error: "Title is required" };
  const description = ((formData.get("description") as string) || "").trim() || null;
  const dueAt = (formData.get("due_at") as string) || null;
  // Explicit audience decision: the bulk form exposes the same visibility
  // control as single-task creation.
  const visibility = (formData.get("visibility_scope") as string) || "staff";
  if (!TASK_VISIBILITY_VALUES.has(visibility)) {
    return { error: "Invalid visibility" };
  }

  const rows = students.map((s) => ({
    firm_id: ctx.firmId,
    title,
    description,
    task_type: "general",
    priority: (formData.get("priority") as string) || "medium",
    status: "pending",
    visibility_scope: visibility,
    assigned_user_id: ctx.dbUserId,
    student_id: s.id,
    due_at: dueAt,
    created_by_user_id: ctx.dbUserId,
    updated_by_user_id: ctx.dbUserId,
  }));
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
