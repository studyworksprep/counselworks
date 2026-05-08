"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
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
  activateSteps,
  archiveTemplate as archiveTemplateService,
  completeStudentWorkflowStep,
  getStepsByTemplate,
  getStudentWorkflowWithSteps,
  instantiateWorkflowFromTemplate,
  reorderTemplateSteps as reorderTemplateStepsService,
  resolveActivatableStepIds,
  skipStudentWorkflowStep,
  updateStudentWorkflowStatus,
  updateStudentWorkflowStep,
} from "@/modules/workflows";

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

  const db = createServerClient();
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

  const db = createServerClient();
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

  const db = createServerClient();
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

  const db = createServerClient();
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

  const db = createServerClient();
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

  const db = createServerClient();
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

  const db = createServerClient();
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
    start_date: formData.get("start_date"),
    name: formData.get("name") ?? undefined,
    description: formData.get("description") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = createServerClient();

  // Confirm the template is accessible (firm-owned or system) and the student
  // belongs to this firm.
  const { data: template } = await db
    .from("workflow_templates")
    .select("id, firm_id, is_system_template")
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

  const { data: workflow, error } = await instantiateWorkflowFromTemplate(db, {
    firmId: ctx.firmId,
    studentId: parsed.data.student_id,
    templateId: parsed.data.template_id,
    startDate: new Date(`${parsed.data.start_date}T00:00:00Z`),
    createdByUserId: ctx.dbUserId,
    name: parsed.data.name,
    description: parsed.data.description,
    roleAssignees,
  });

  if (error || !workflow) {
    console.error("Failed to instantiate workflow:", error);
    return { error: "Failed to apply workflow" };
  }

  revalidatePath(`/students/${parsed.data.student_id}`);
  revalidatePath("/workflows");
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

  const db = createServerClient();
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

  const db = createServerClient();

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

  if (parsed.data === "completed") {
    const { error } = await completeStudentWorkflowStep(db, stepId, ctx.dbUserId);
    if (error) return { error: "Failed to complete step" };
    await maybeActivateDownstream(db, parentWorkflow.id);
  } else if (parsed.data === "skipped") {
    const { error } = await skipStudentWorkflowStep(db, stepId);
    if (error) return { error: "Failed to skip step" };
    await maybeActivateDownstream(db, parentWorkflow.id);
  } else {
    const { error } = await updateStudentWorkflowStep(db, stepId, {
      status: parsed.data,
    });
    if (error) return { error: "Failed to update step" };
  }

  revalidatePath(`/students/${parentWorkflow.student_id}`);
  revalidatePath("/workflows");
  return { success: true };
}

// ===========================================================================
// Internal helpers
// ===========================================================================

async function getTemplateIdForStep(
  db: ReturnType<typeof createServerClient>,
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

/**
 * After a step is completed or skipped, find downstream blocked steps whose
 * prerequisites are now satisfied and flip them to `pending`.
 */
async function maybeActivateDownstream(
  db: ReturnType<typeof createServerClient>,
  workflowId: string,
): Promise<void> {
  const { data: workflow } = await getStudentWorkflowWithSteps(db, workflowId);
  if (!workflow) return;

  const templateId = workflow.workflow_template_id;
  if (!templateId) return; // ad-hoc workflow has no dependency graph

  const { data: templateSteps } = await getStepsByTemplate(db, templateId);
  const activatable = resolveActivatableStepIds(
    workflow.student_workflow_steps,
    templateSteps,
  );
  if (activatable.length > 0) {
    await activateSteps(db, activatable);
  }
}
