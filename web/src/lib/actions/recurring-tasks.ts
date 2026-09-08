"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "../db/client";
import { resolveUserAndFirm, STAFF_ROLE_LIST } from "../auth/resolve";
import {
  AuthorizationError,
  requireStaff,
  requireStudentAccess,
  type ActorContext,
} from "../auth/authorize";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAuditEvent } from "../audit";
import {
  TASK_CADENCE_VALUES,
  TASK_PRIORITY_VALUES,
  TASK_TYPE_VALUES,
  TASK_VISIBILITY_VALUES,
  type TaskCadence,
} from "../constants/tasks";
import { materializeRecurringTasks } from "../tasks/materialize-recurring";
import { describeRecurrence } from "../tasks/recurrence";

/**
 * Recurring task templates (fix plan 13.3). Staff-only, assignment-scoped
 * through the shared student-access helper. Every path that creates or
 * re-activates a template materializes its due occurrences immediately so
 * the Tasks list (and the portals, per visibility) never wait on the cron.
 */

const UUID = z.string().uuid();

const templateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z.string().trim().max(2000).nullable(),
    task_type: z.string().refine((v) => TASK_TYPE_VALUES.has(v), "Invalid task type"),
    priority: z.string().refine((v) => TASK_PRIORITY_VALUES.has(v), "Invalid priority"),
    visibility_scope: z
      .string()
      .refine((v) => TASK_VISIBILITY_VALUES.has(v), "Invalid visibility"),
    assigned_user_id: UUID.nullable(),
    student_id: UUID.nullable(),
    cadence: z.string().refine((v) => TASK_CADENCE_VALUES.has(v), "Choose a cadence"),
    weekday: z.number().int().min(0).max(6).nullable(),
    day_of_month: z.number().int().min(1).max(28).nullable(),
    starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date"),
  })
  .superRefine((v, ctx) => {
    if (v.cadence === "weekly" && v.weekday === null) {
      ctx.addIssue({ code: "custom", message: "Choose a weekday", path: ["weekday"] });
    }
    if (v.cadence === "monthly" && v.day_of_month === null) {
      ctx.addIssue({
        code: "custom",
        message: "Choose a day of the month (1–28)",
        path: ["day_of_month"],
      });
    }
    // Same rule as createTask: the portals list tasks by student.
    if (v.visibility_scope !== "staff" && !v.student_id) {
      ctx.addIssue({
        code: "custom",
        message: "Portal-visible tasks must be linked to a student",
        path: ["student_id"],
      });
    }
  });

type TemplateInput = z.infer<typeof templateSchema>;

function optionalString(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  const value = typeof raw === "string" ? raw.trim() : "";
  return value === "" ? null : value;
}

function optionalInt(formData: FormData, key: string): number | null {
  const value = optionalString(formData, key);
  if (value === null) return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
}

function parseTemplateForm(formData: FormData) {
  const cadence = optionalString(formData, "cadence") ?? "";
  return templateSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    description: optionalString(formData, "description"),
    task_type: optionalString(formData, "task_type") ?? "general",
    priority: optionalString(formData, "priority") ?? "medium",
    // The form always renders the audience control; "staff" only when the
    // counselor left it there (no hidden default).
    visibility_scope: optionalString(formData, "visibility_scope") ?? "",
    assigned_user_id: optionalString(formData, "assigned_user_id"),
    student_id: optionalString(formData, "student_id"),
    cadence,
    weekday: cadence === "weekly" ? optionalInt(formData, "weekday") : null,
    day_of_month: cadence === "monthly" ? optionalInt(formData, "day_of_month") : null,
    starts_on: optionalString(formData, "starts_on") ?? "",
  });
}

function firstIssue(parsed: { error: z.ZodError }): string {
  return parsed.error.issues[0]?.message ?? "Invalid input";
}

/**
 * Authorization for a template's targets: the actor must be staff, must be
 * able to see the student (firm-wide role or assigned), and may only assign
 * an active staff member of the firm.
 */
async function authorizeTemplateTargets(
  db: SupabaseClient,
  ctx: ActorContext,
  input: Pick<TemplateInput, "student_id" | "assigned_user_id">
): Promise<string | null> {
  if (input.student_id) {
    try {
      await requireStudentAccess(db, ctx, input.student_id);
    } catch (e) {
      if (e instanceof AuthorizationError) return "Student not found";
      throw e;
    }
  }
  if (input.assigned_user_id) {
    const { data } = await db
      .from("firm_memberships")
      .select("user_id")
      .eq("firm_id", ctx.firmId)
      .eq("user_id", input.assigned_user_id)
      .eq("status", "active")
      .in("role", [...STAFF_ROLE_LIST])
      .limit(1)
      .maybeSingle();
    if (!data) return "Assignee must be an active staff member";
  }
  return null;
}

function revalidateTaskSurfaces(studentId: string | null) {
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  if (studentId) revalidatePath(`/students/${studentId}/tasks`);
  // Family workspaces and the portals render generated tasks by visibility.
  revalidatePath("/families/[id]/tasks", "page");
  revalidatePath("/student-tasks");
  revalidatePath("/family-tasks");
  revalidatePath("/student-dashboard");
  revalidatePath("/family-dashboard");
}

function toRow(input: TemplateInput) {
  return {
    title: input.title,
    description: input.description,
    task_type: input.task_type,
    priority: input.priority,
    visibility_scope: input.visibility_scope,
    assigned_user_id: input.assigned_user_id,
    student_id: input.student_id,
    cadence: input.cadence as TaskCadence,
    weekday: input.weekday,
    day_of_month: input.day_of_month,
    starts_on: input.starts_on,
  };
}

export async function createRecurringTask(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const parsed = parseTemplateForm(formData);
  if (!parsed.success) return { error: firstIssue(parsed) };
  const input = parsed.data;

  const db = getDb();
  const denied = await authorizeTemplateTargets(db, ctx, input);
  if (denied) return { error: denied };

  const { data, error } = await db
    .from("recurring_task_templates")
    .insert({
      firm_id: ctx.firmId,
      ...toRow(input),
      active: true,
      created_by_user_id: ctx.dbUserId,
      updated_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Failed to create recurring task:", error);
    return { error: "Failed to create recurring task" };
  }

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "recurring_task_template",
    entityId: data.id,
    actionType: "recurring_task_created",
    label: `Recurring task "${input.title}" created (${describeRecurrence(toRow(input))})`,
    metadata: { student_id: input.student_id, cadence: input.cadence },
  });

  // First occurrence now, not at the next cron tick.
  const materialized = await materializeRecurringTasks(db, {
    firmId: ctx.firmId,
    templateId: data.id,
    nowMs: Date.now(),
    actorUserId: ctx.dbUserId,
  });

  revalidateTaskSurfaces(input.student_id);
  return { id: data.id as string, created: materialized.created };
}

export async function updateRecurringTask(templateId: string, formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }
  if (!UUID.safeParse(templateId).success) return { error: "Recurring task not found" };

  const parsed = parseTemplateForm(formData);
  if (!parsed.success) return { error: firstIssue(parsed) };
  const input = parsed.data;

  const db = getDb();
  const { data: existing } = await db
    .from("recurring_task_templates")
    .select("id, student_id, active")
    .eq("id", templateId)
    .eq("firm_id", ctx.firmId)
    .is("archived_at", null)
    .maybeSingle();
  if (!existing) return { error: "Recurring task not found" };

  // The actor must be allowed to touch both the current and the new student.
  const deniedExisting = await authorizeTemplateTargets(db, ctx, {
    student_id: existing.student_id,
    assigned_user_id: null,
  });
  if (deniedExisting) return { error: "Recurring task not found" };
  const denied = await authorizeTemplateTargets(db, ctx, input);
  if (denied) return { error: denied };

  // Every column comes from the form (rule 6) — nothing is nulled by
  // omission. Already-generated tasks keep their own values; only future
  // occurrences pick up the edit.
  const { error } = await db
    .from("recurring_task_templates")
    .update({ ...toRow(input), updated_by_user_id: ctx.dbUserId })
    .eq("id", templateId)
    .eq("firm_id", ctx.firmId);
  if (error) {
    console.error("Failed to update recurring task:", error);
    return { error: "Failed to update recurring task" };
  }

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "recurring_task_template",
    entityId: templateId,
    actionType: "recurring_task_updated",
    label: `Recurring task "${input.title}" updated (${describeRecurrence(toRow(input))})`,
    metadata: { student_id: input.student_id, cadence: input.cadence },
  });

  // Re-run for this template: a changed rule may make today due; the unique
  // occurrence index makes an unchanged rule a no-op.
  const materialized = existing.active
    ? await materializeRecurringTasks(db, {
        firmId: ctx.firmId,
        templateId,
        nowMs: Date.now(),
        actorUserId: ctx.dbUserId,
      })
    : { created: 0 };

  revalidateTaskSurfaces(input.student_id);
  if (existing.student_id && existing.student_id !== input.student_id) {
    revalidatePath(`/students/${existing.student_id}/tasks`);
  }
  return { id: templateId, created: materialized.created };
}

async function loadOwnedTemplate(
  db: SupabaseClient,
  ctx: ActorContext,
  templateId: string
) {
  if (!UUID.safeParse(templateId).success) return null;
  const { data } = await db
    .from("recurring_task_templates")
    .select("id, title, student_id, active")
    .eq("id", templateId)
    .eq("firm_id", ctx.firmId)
    .is("archived_at", null)
    .maybeSingle();
  if (!data) return null;
  const denied = await authorizeTemplateTargets(db, ctx, {
    student_id: data.student_id,
    assigned_user_id: null,
  });
  return denied ? null : data;
}

/** Pause (active=false) stops the cron; resume catches up within the window. */
export async function setRecurringTaskActive(templateId: string, active: boolean) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const db = getDb();
  const template = await loadOwnedTemplate(db, ctx, templateId);
  if (!template) return { error: "Recurring task not found" };

  const { error } = await db
    .from("recurring_task_templates")
    .update({ active, updated_by_user_id: ctx.dbUserId })
    .eq("id", templateId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to update recurring task" };

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "recurring_task_template",
    entityId: templateId,
    actionType: active ? "recurring_task_resumed" : "recurring_task_paused",
    label: `Recurring task "${template.title}" ${active ? "resumed" : "paused"}`,
  });

  if (active) {
    await materializeRecurringTasks(db, {
      firmId: ctx.firmId,
      templateId,
      nowMs: Date.now(),
      actorUserId: ctx.dbUserId,
    });
  }

  revalidateTaskSurfaces(template.student_id);
  return { success: true };
}

/** Archive hides the template for good; generated tasks are left untouched. */
export async function archiveRecurringTask(templateId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const db = getDb();
  const template = await loadOwnedTemplate(db, ctx, templateId);
  if (!template) return { error: "Recurring task not found" };

  const { error } = await db
    .from("recurring_task_templates")
    .update({
      active: false,
      archived_at: new Date().toISOString(),
      updated_by_user_id: ctx.dbUserId,
    })
    .eq("id", templateId)
    .eq("firm_id", ctx.firmId);
  if (error) return { error: "Failed to archive recurring task" };

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "recurring_task_template",
    entityId: templateId,
    actionType: "recurring_task_archived",
    label: `Recurring task "${template.title}" archived`,
  });

  revalidateTaskSurfaces(template.student_id);
  return { success: true };
}
