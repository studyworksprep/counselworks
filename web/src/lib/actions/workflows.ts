"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import { recordAuditEvent } from "../audit";
import {
  applyWorkflowToStudentSchema,
  createTemplateStepSchema,
  createWorkflowTemplateSchema,
  reorderTemplateStepsSchema,
  stepStatusSchema,
  updateTemplateStepSchema,
  updateWorkflowTemplateSchema,
  workflowStatusSchema,
} from "../validation/schemas";
import {
  archiveTemplate as archiveTemplateService,
  completeStudentWorkflowStep,
  instantiateWorkflowFromTemplate,
  reorderTemplateSteps as reorderTemplateStepsService,
  skipStudentWorkflowStep,
  updateStudentWorkflowStatus,
  updateStudentWorkflowStep,
} from "@/modules/workflows";
import {
  archiveLinkedTask,
  markLinkedTaskCompleted,
  materializeTasksForNewWorkflow,
  runStepActivationAndMaterialize,
} from "@/lib/workflows/tasks-sync";

// ===========================================================================
// Templates
// ===========================================================================

export async function createWorkflowTemplate(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const parsed = createWorkflowTemplateSchema.safeParse({
    name: formData.get("name"),
    workflow_type: formData.get("workflow_type"),
    description: formData.get("description") ?? undefined,
    category: formData.get("category") ?? undefined,
    is_default: formData.get("is_default") === "true" ? true : undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = getDb();
  const { data, error } = await db
    .from("workflow_templates")
    .insert({
      firm_id: ctx.firmId,
      created_by_user_id: ctx.dbUserId,
      is_system_template: false,
      is_active: true,
      ...parsed.data,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create workflow template:", error);
    return { error: "Failed to create workflow template" };
  }

  revalidatePath("/workflows");
  return { id: data.id };
}

export async function updateWorkflowTemplate(
  templateId: string,
  formData: FormData,
) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const parsed = updateWorkflowTemplateSchema.safeParse({
    name: formData.get("name") ?? undefined,
    workflow_type: formData.get("workflow_type") ?? undefined,
    description: formData.get("description") ?? undefined,
    category: formData.get("category") ?? undefined,
    is_active:
      formData.get("is_active") === null
        ? undefined
        : formData.get("is_active") === "true",
    is_default:
      formData.get("is_default") === null
        ? undefined
        : formData.get("is_default") === "true",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = getDb();
  const { error } = await db
    .from("workflow_templates")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", templateId)
    .eq("firm_id", ctx.firmId);

  if (error) {
    console.error("Failed to update workflow template:", error);
    return { error: "Failed to update workflow template" };
  }

  revalidatePath("/workflows");
  revalidatePath(`/workflows/${templateId}`);
  return { success: true };
}

export async function archiveWorkflowTemplate(templateId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = getDb();
  // Scope-check: can only archive templates owned by this firm.
  const { data: existing } = await db
    .from("workflow_templates")
    .select("id")
    .eq("id", templateId)
    .eq("firm_id", ctx.firmId)
    .single();
  if (!existing) return { error: "Template not found" };

  const { error } = await archiveTemplateService(db, templateId);
  if (error) {
    console.error("Failed to archive workflow template:", error);
    return { error: "Failed to archive workflow template" };
  }

  revalidatePath("/workflows");
  return { success: true };
}

// ===========================================================================
// Template steps
// ===========================================================================

export async function addTemplateStep(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const stepOrderRaw = formData.get("step_order");
  const dueOffsetRaw = formData.get("default_due_offset_days");

  const parsed = createTemplateStepSchema.safeParse({
    workflow_template_id: formData.get("workflow_template_id"),
    name: formData.get("name"),
    step_order: stepOrderRaw === null ? undefined : Number(stepOrderRaw),
    step_type: formData.get("step_type"),
    description: formData.get("description") ?? undefined,
    task_type: formData.get("task_type") ?? undefined,
    default_assignee_role: formData.get("default_assignee_role") ?? undefined,
    default_due_offset_days:
      dueOffsetRaw === null || dueOffsetRaw === "" ? undefined : Number(dueOffsetRaw),
    depends_on_step_id: formData.get("depends_on_step_id") ?? undefined,
    is_required:
      formData.get("is_required") === null
        ? undefined
        : formData.get("is_required") === "true",
    visibility_scope: formData.get("visibility_scope") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = getDb();
  // Confirm the parent template belongs to this firm before adding steps.
  const { data: parent } = await db
    .from("workflow_templates")
    .select("id")
    .eq("id", parsed.data.workflow_template_id)
    .eq("firm_id", ctx.firmId)
    .single();
  if (!parent) return { error: "Template not found" };

  const { data, error } = await db
    .from("workflow_template_steps")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) {
    console.error("Failed to add template step:", error);
    return { error: "Failed to add template step" };
  }

  revalidatePath(`/workflows/${parsed.data.workflow_template_id}`);
  return { id: data.id };
}

export async function updateTemplateStep(stepId: string, formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const stepOrderRaw = formData.get("step_order");
  const dueOffsetRaw = formData.get("default_due_offset_days");

  const parsed = updateTemplateStepSchema.safeParse({
    name: formData.get("name") ?? undefined,
    step_order: stepOrderRaw === null ? undefined : Number(stepOrderRaw),
    step_type: formData.get("step_type") ?? undefined,
    description: formData.get("description") ?? undefined,
    task_type: formData.get("task_type") ?? undefined,
    default_assignee_role: formData.get("default_assignee_role") ?? undefined,
    default_due_offset_days:
      dueOffsetRaw === null || dueOffsetRaw === "" ? undefined : Number(dueOffsetRaw),
    depends_on_step_id: formData.get("depends_on_step_id") ?? undefined,
    is_required:
      formData.get("is_required") === null
        ? undefined
        : formData.get("is_required") === "true",
    visibility_scope: formData.get("visibility_scope") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = getDb();
  const templateId = await getTemplateIdForStep(db, stepId, ctx.firmId);
  if (!templateId) return { error: "Step not found" };

  const { error } = await db
    .from("workflow_template_steps")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", stepId);

  if (error) {
    console.error("Failed to update template step:", error);
    return { error: "Failed to update template step" };
  }

  revalidatePath(`/workflows/${templateId}`);
  return { success: true };
}

export async function deleteTemplateStep(stepId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = getDb();
  const templateId = await getTemplateIdForStep(db, stepId, ctx.firmId);
  if (!templateId) return { error: "Step not found" };

  const { error } = await db
    .from("workflow_template_steps")
    .delete()
    .eq("id", stepId);

  if (error) return { error: "Failed to delete template step" };

  revalidatePath(`/workflows/${templateId}`);
  return { success: true };
}

export async function reorderTemplateSteps(
  templateId: string,
  orderedStepIds: string[],
) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const parsed = reorderTemplateStepsSchema.safeParse({
    template_id: templateId,
    ordered_step_ids: orderedStepIds,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = getDb();
  const { data: parent } = await db
    .from("workflow_templates")
    .select("id")
    .eq("id", templateId)
    .eq("firm_id", ctx.firmId)
    .single();
  if (!parent) return { error: "Template not found" };

  const { error } = await reorderTemplateStepsService(
    db,
    templateId,
    parsed.data.ordered_step_ids,
  );
  if (error) return { error: "Failed to reorder steps" };

  revalidatePath(`/workflows/${templateId}`);
  return { success: true };
}

// ===========================================================================
// Student workflows
// ===========================================================================

export async function applyWorkflowToStudent(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const parsed = applyWorkflowToStudentSchema.safeParse({
    template_id: formData.get("template_id"),
    student_id: formData.get("student_id"),
    start_date: formData.get("start_date") ?? undefined,
    student_college_id: formData.get("student_college_id") ?? undefined,
    name: formData.get("name") ?? undefined,
    description: formData.get("description") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = getDb();

  // Confirm the template is accessible (firm-owned or system) and the student
  // belongs to this firm.
  const { data: template } = await db
    .from("workflow_templates")
    .select("id, firm_id, is_system_template, instantiation_scope, name")
    .eq("id", parsed.data.template_id)
    .single();
  if (!template) return { error: "Template not found" };
  if (!template.is_system_template && template.firm_id !== ctx.firmId) {
    return { error: "Template not found" };
  }

  const { data: student } = await db
    .from("students")
    .select("id")
    .eq("id", parsed.data.student_id)
    .eq("firm_id", ctx.firmId)
    .single();
  if (!student) return { error: "Student not found" };

  // Per-college templates: require a student_college_id, derive name and
  // start date from the college and (if known) its application deadline.
  let startDateIso: string | undefined = parsed.data.start_date;
  let workflowName: string | undefined = parsed.data.name;
  let studentCollegeId: string | undefined;

  if (template.instantiation_scope === "student_college") {
    if (!parsed.data.student_college_id) {
      return { error: "Pick a college from the student's college list" };
    }
    const { data: sc } = await db
      .from("student_colleges")
      .select("id, college_id, colleges:college_id(name)")
      .eq("id", parsed.data.student_college_id)
      .eq("firm_id", ctx.firmId)
      .eq("student_id", parsed.data.student_id)
      .single();
    if (!sc) return { error: "Student college not found" };

    const collegeRow = Array.isArray(sc.colleges)
      ? sc.colleges[0]
      : (sc.colleges as { name: string } | null);
    const collegeName = collegeRow?.name ?? "College";
    studentCollegeId = sc.id;

    if (!workflowName) {
      workflowName = `${template.name} — ${collegeName}`;
    }

    if (!startDateIso) {
      // Default to the application's deadline minus 45 days when known.
      const { data: app } = await db
        .from("applications")
        .select("deadline_at")
        .eq("firm_id", ctx.firmId)
        .eq("student_id", parsed.data.student_id)
        .eq("college_id", sc.college_id)
        .not("deadline_at", "is", null)
        .order("deadline_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (app?.deadline_at) {
        const deadline = new Date(app.deadline_at as string);
        deadline.setUTCDate(deadline.getUTCDate() - 45);
        startDateIso = deadline.toISOString().slice(0, 10);
      } else {
        startDateIso = new Date().toISOString().slice(0, 10);
      }
    }
  } else if (!startDateIso) {
    return { error: "Start date is required" };
  }

  // Build role -> userId map from this student's staff assignments so the
  // service can resolve `default_assignee_role` against real users.
  const { data: staffRows } = await db
    .from("student_staff_assignments")
    .select("assignment_type, user_id, is_primary")
    .eq("firm_id", ctx.firmId)
    .eq("student_id", parsed.data.student_id);

  const roleAssignees: Record<string, string> = {};
  for (const row of staffRows ?? []) {
    // Prefer primary assignees if multiple staff share an assignment type.
    if (!roleAssignees[row.assignment_type] || row.is_primary) {
      roleAssignees[row.assignment_type] = row.user_id;
    }
  }

  // Resolve deadline-anchored steps. Any template step with a deadline_anchor
  // gets its due date computed from external data (applications + the
  // student's senior year) instead of the workflow start + offset.
  const dueDateOverrides = await resolveDeadlineAnchors(
    db,
    parsed.data.template_id,
    parsed.data.student_id,
    ctx.firmId,
  );

  const { data: workflow, error } = await instantiateWorkflowFromTemplate(db, {
    firmId: ctx.firmId,
    studentId: parsed.data.student_id,
    templateId: parsed.data.template_id,
    startDate: new Date(`${startDateIso}T00:00:00Z`),
    createdByUserId: ctx.dbUserId,
    name: workflowName,
    description: parsed.data.description,
    studentCollegeId,
    roleAssignees,
    dueDateOverrides,
  });

  if (error || !workflow) {
    console.error("Failed to instantiate workflow:", error);
    return { error: "Failed to apply workflow" };
  }

  const { error: matError } = await materializeTasksForNewWorkflow(db, workflow.id, {
    dbUserId: ctx.dbUserId,
    firmId: ctx.firmId,
  });
  if (matError) {
    console.error("Workflow created but task materialization failed:", matError);
  }

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "student_workflow",
    entityId: workflow.id,
    actionType: "workflow_applied",
    label: `Workflow applied: ${workflow.name ?? "workflow"}`,
  });

  revalidatePath(`/students/${parsed.data.student_id}`);
  revalidatePath(`/students/${parsed.data.student_id}/colleges`);
  revalidatePath("/workflows");
  revalidatePath("/tasks");
  return { id: workflow.id };
}

export async function setStudentWorkflowStatus(
  workflowId: string,
  status: string,
) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const parsed = workflowStatusSchema.safeParse(status);
  if (!parsed.success) return { error: "Invalid status" };

  const db = getDb();
  const { data: workflow } = await db
    .from("student_workflows")
    .select("id, student_id")
    .eq("id", workflowId)
    .eq("firm_id", ctx.firmId)
    .single();
  if (!workflow) return { error: "Workflow not found" };

  const { error } = await updateStudentWorkflowStatus(db, workflowId, parsed.data);
  if (error) return { error: "Failed to update workflow" };

  revalidatePath(`/students/${workflow.student_id}`);
  revalidatePath("/workflows");
  return { success: true };
}

export async function setStudentWorkflowStepStatus(
  stepId: string,
  status: string,
) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const parsed = stepStatusSchema.safeParse(status);
  if (!parsed.success) return { error: "Invalid status" };

  const db = getDb();

  // Look up step + parent workflow to verify firm ownership.
  const { data: step } = await db
    .from("student_workflow_steps")
    .select(
      "id, student_workflow_id, student_workflows!inner(id, firm_id, student_id)",
    )
    .eq("id", stepId)
    .single();
  if (!step) return { error: "Step not found" };
  // Supabase returns the joined row as an object when using !inner.
  const parentWorkflow = (step as unknown as {
    student_workflows: { firm_id: string; student_id: string; id: string };
  }).student_workflows;
  if (parentWorkflow.firm_id !== ctx.firmId) {
    return { error: "Step not found" };
  }

  const syncCtx = { dbUserId: ctx.dbUserId, firmId: ctx.firmId };

  if (parsed.data === "completed") {
    const { error } = await completeStudentWorkflowStep(db, stepId, ctx.dbUserId);
    if (error) return { error: "Failed to complete step" };
    await markLinkedTaskCompleted(db, stepId, syncCtx);
    await runStepActivationAndMaterialize(db, parentWorkflow.id, syncCtx);
  } else if (parsed.data === "skipped") {
    const { error } = await skipStudentWorkflowStep(db, stepId);
    if (error) return { error: "Failed to skip step" };
    await archiveLinkedTask(db, stepId, syncCtx);
    await runStepActivationAndMaterialize(db, parentWorkflow.id, syncCtx);
  } else {
    const { error } = await updateStudentWorkflowStep(db, stepId, {
      status: parsed.data,
    });
    if (error) return { error: "Failed to update step" };
  }

  revalidatePath(`/students/${parentWorkflow.student_id}`);
  revalidatePath("/workflows");
  revalidatePath("/tasks");
  return { success: true };
}

// ===========================================================================
// Internal helpers
// ===========================================================================

async function getTemplateIdForStep(
  db: ReturnType<typeof getDb>,
  stepId: string,
  firmId: string,
): Promise<string | null> {
  const { data } = await db
    .from("workflow_template_steps")
    .select("workflow_template_id, workflow_templates!inner(firm_id)")
    .eq("id", stepId)
    .single();
  if (!data) return null;
  const parent = (data as unknown as {
    workflow_template_id: string;
    workflow_templates: { firm_id: string | null };
  });
  if (parent.workflow_templates.firm_id !== firmId) return null;
  return parent.workflow_template_id;
}

const EA_TYPES = ["ea", "ed", "ed2", "rea"];

/**
 * Resolves any template steps that opt into deadline anchoring (rather than
 * the default startDate+offset due date). Returns a map of template_step_id
 * -> resolved YYYY-MM-DD due date (or null when no plausible date exists).
 *
 * Anchors:
 *   - 'earliest_ea_deadline': MIN(applications.deadline_at) for EA-family
 *     application types. Calendar fallback (Nov 1 of senior year start)
 *     only when the student has at least one EA-family college on their
 *     list; otherwise null (the step shows with no due date).
 *   - 'earliest_rd_deadline': MIN(applications.deadline_at) for RD.
 *     Calendar fallback (Jan 1 of graduation_year) only when the student
 *     has at least one RD college on the list; otherwise null.
 */
async function resolveDeadlineAnchors(
  db: ReturnType<typeof getDb>,
  templateId: string,
  studentId: string,
  firmId: string,
): Promise<Record<string, string | null>> {
  const { data: anchoredSteps } = await db
    .from("workflow_template_steps")
    .select("id, deadline_anchor")
    .eq("workflow_template_id", templateId)
    .not("deadline_anchor", "is", null);

  const overrides: Record<string, string | null> = {};
  if (!anchoredSteps || anchoredSteps.length === 0) return overrides;

  // Cache lookups so a template that has both EA and RD steps queries each
  // bucket only once.
  const cache: Partial<Record<string, string | null>> = {};

  for (const step of anchoredSteps) {
    const anchor = step.deadline_anchor as string;
    if (!(anchor in cache)) {
      cache[anchor] = await resolveOneAnchor(db, anchor, studentId, firmId);
    }
    overrides[step.id as string] = cache[anchor] ?? null;
  }
  return overrides;
}

async function resolveOneAnchor(
  db: ReturnType<typeof getDb>,
  anchor: string,
  studentId: string,
  firmId: string,
): Promise<string | null> {
  if (anchor !== "earliest_ea_deadline" && anchor !== "earliest_rd_deadline") {
    return null; // unknown anchor
  }

  const isEa = anchor === "earliest_ea_deadline";
  const types = isEa ? EA_TYPES : ["rd"];

  // 1. Use the earliest formal application deadline for this round if any.
  const { data: app } = await db
    .from("applications")
    .select("deadline_at")
    .eq("firm_id", firmId)
    .eq("student_id", studentId)
    .in("application_type", types)
    .not("deadline_at", "is", null)
    .order("deadline_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (app?.deadline_at) {
    return new Date(app.deadline_at as string).toISOString().slice(0, 10);
  }

  // 2. No application yet — but the student may still plan to apply in this
  // round. Use the calendar fallback only when at least one student_colleges
  // row signals that intent. Otherwise leave the step without a due date.
  const { count: planned } = await db
    .from("student_colleges")
    .select("id", { count: "exact", head: true })
    .eq("firm_id", firmId)
    .eq("student_id", studentId)
    .in("round_type", types);

  if (!planned || planned === 0) return null;

  // 3. Calendar fallback derived from the student's senior year.
  const { data: student } = await db
    .from("students")
    .select("graduation_year")
    .eq("id", studentId)
    .eq("firm_id", firmId)
    .single();
  const gradYear = (student?.graduation_year as number | undefined) ?? null;
  if (!gradYear) return null;

  return isEa ? `${gradYear - 1}-11-01` : `${gradYear}-01-01`;
}

