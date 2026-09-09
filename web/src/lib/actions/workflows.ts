"use server";
import { taskOwnerChoices } from "../auth/task-owner";
import type { PlanSnapshot } from "../workflows/plan";
import { z } from "zod";
import { preparePlan } from "../db/queries";
import { dateOnly, planEditSchema } from "../workflows/plan";
import { updateTaskStatus } from "./tasks";

import { requireStudentAccess, requireTaskMutation } from "../auth/authorize";
import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import { recordAuditEvent } from "../audit";
import {
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
  instantiateWorkflowFromTemplate,
  reorderTemplateSteps as reorderTemplateStepsService,
  skipStudentWorkflowStep,
  updateStudentWorkflowStatus,
} from "@/modules/workflows";
import {
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
    completion_mode: formData.get("completion_mode") ?? undefined,
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
    completion_mode: formData.get("completion_mode") ?? undefined,
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
    return { error: error.message };
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

const planInputSchema = z.object({
  templateId:z.string().uuid(),studentId:z.string().uuid(),startDate:dateOnly.optional(),studentCollegeId:z.string().uuid().optional(),
  name:z.string().trim().min(1).max(500).optional(),edits:z.record(z.string().uuid(),planEditSchema).optional(),repeatKey:z.string().uuid().optional(),
});
function readPlanInput(form:FormData) {
  return planInputSchema.parse({templateId:form.get("template_id"),studentId:form.get("student_id"),
    startDate:form.get("start_date") || undefined,studentCollegeId:form.get("student_college_id") || undefined,
    name:form.get("name") || undefined,edits:JSON.parse(String(form.get("edits") || "{}")),repeatKey:form.get("repeat_key") || undefined});
}
export async function previewWorkflowApplication(formData:FormData) {
  const ctx=await resolveUserAndFirm();
  if(!ctx) return {error:"Not authenticated"};
  try {return {preview:await preparePlan(getDb(),ctx,readPlanInput(formData))};}
  catch(error) {return {error:error instanceof Error ? error.message : "Unable to preview plan"};}
}
export async function applyWorkflowToStudent(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const parsed=planInputSchema.safeParse((()=>{try{return readPlanInput(formData);}catch{return {};}})());
  if(!parsed.success) return {error:"Invalid plan input"};
  const input=parsed.data;
  const fingerprint=String(formData.get("fingerprint") || "");
  if(!fingerprint) return {error:"Preview the plan before applying"};
  const db=getDb();
  const {data:workflow,error}=await instantiateWorkflowFromTemplate(db,{
    firmId:ctx.firmId,createdByUserId:ctx.dbUserId,...input,
    startDate:input.startDate ? new Date(`${input.startDate}T12:00:00Z`) : undefined,previewFingerprint:fingerprint,
  });
  if(error || !workflow) return {error:error?.message || "Unable to apply plan"};
  const { error: matError } = await materializeTasksForNewWorkflow(db, workflow.id, {
    dbUserId: ctx.dbUserId,
    firmId: ctx.firmId,
  });
  if (matError) {
    console.error("Workflow created but task materialization failed:", matError);
  }

  if(!workflow.reused) await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "student_workflow",
    entityId: workflow.id,
    actionType: "workflow_applied",
    label: `Workflow applied: ${workflow.name ?? "workflow"}`,
  });

  revalidatePath(`/students/${input.studentId}`);
  revalidatePath(`/students/${input.studentId}/tasks`);
  revalidatePath(`/workflows/${input.templateId}`);
  revalidatePath("/family-tasks");
  revalidatePath(`/students/${input.studentId}/colleges`);
  revalidatePath("/workflows");
  revalidatePath("/tasks");
  // Applying a workflow materializes portal-visible tasks and workflow
  // progress in both portals (rule 2).
  revalidatePath("/student-tasks");
  revalidatePath("/student-workflows");
  revalidatePath("/family-workflows");
  revalidatePath("/student-dashboard");
  revalidatePath("/family-dashboard");
  return matError ? { id: workflow.id, error: "Plan saved, but some tasks could not be created. Open the student workspace and choose Retry missing tasks." } : { id: workflow.id, reused: workflow.reused ?? false };
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
  try { await requireStudentAccess(db, ctx, workflow.student_id); } catch { return { error: "Not authorized" }; }

  if (["completed", "not_started"].includes(parsed.data)) return { error: "Workflow progress is calculated from its tasks" };
  const { error } = await updateStudentWorkflowStatus(db, workflowId, parsed.data);
  if (error) return { error: "Failed to update workflow" };

  revalidatePath(`/students/${workflow.student_id}`);
  revalidatePath("/workflows");
  revalidatePath("/student-workflows");
  revalidatePath("/family-workflows");
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
      "id, linked_task_id, status, student_workflow_id, student_workflows!inner(id, firm_id, student_id)",
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

  try { await requireStudentAccess(db, ctx, parentWorkflow.student_id); } catch { return { error: "Not authorized" }; }

  if (parsed.data === "completed") {
    if (step.status === "blocked" || !step.linked_task_id) return { error: "This step is not ready. Resolve its task owner first." };
    try { await requireTaskMutation(db, ctx, step.linked_task_id); } catch { return { error: "Resolve the task owner before completing this step" }; }
  }

  const syncCtx = { dbUserId: ctx.dbUserId, firmId: ctx.firmId };

  if (step.linked_task_id) {
    if (parsed.data === "skipped") return { error: "Keep the task and its artifacts. Reopen or complete it from the task detail." };
    if (parsed.data === "blocked") return { error: "Blocking is controlled by prerequisites" };
    return updateTaskStatus(step.linked_task_id, parsed.data);
  }
  if (parsed.data !== "skipped") return { error: "Retry missing tasks before changing this step" };
  const skipped = await skipStudentWorkflowStep(db, stepId);
  if (skipped.error) return { error: "Unable to skip step" };
  const activation = await runStepActivationAndMaterialize(db, parentWorkflow.id, syncCtx);
  if (activation.error) return { error: "Step skipped. Retry missing tasks." };

  revalidatePath(`/students/${parentWorkflow.student_id}`);
  revalidatePath("/workflows");
  revalidatePath("/tasks");
  // Step status changes surface as portal task/progress updates (rule 2).
  revalidatePath("/student-tasks");
  revalidatePath("/student-workflows");
  revalidatePath("/family-workflows");
  revalidatePath("/student-dashboard");
  revalidatePath("/family-dashboard");
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

/** Staff recovery for a saved workflow whose task materialization failed. */
export async function retryWorkflowTasks(workflowId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  const db = getDb();
  const { data: workflow } = await db.from("student_workflows").select("student_id")
    .eq("firm_id", ctx.firmId).eq("id", workflowId).single();
  if (!workflow) return { error: "Workflow not found" };
  try { await requireStudentAccess(db, ctx, workflow.student_id); } catch { return { error: "Not authorized" }; }
  const result = await materializeTasksForNewWorkflow(db, workflowId, ctx);
  revalidatePath(`/students/${workflow.student_id}`);
  revalidatePath(`/students/${workflow.student_id}/tasks`);
  revalidatePath("/tasks");
  return result.error ? { error: "Some tasks could not be created. Retry after resolving access." } : { success: true };
}

export async function getPlanStepEdit(stepId:string) {
  if(!z.string().uuid().safeParse(stepId).success)return {error:"Invalid step"};
  const ctx=await resolveUserAndFirm();if(!ctx)return {error:"Not authenticated"};const db=getDb();
  const {data,error}=await db.from("student_workflow_steps").select("id, updated_at, due_date, snapshot_json, student_workflows!inner(student_id,firm_id)")
    .eq("id",stepId).eq("student_workflows.firm_id",ctx.firmId).single();
  if(error || !data)return {error:"Step not found"};
  const parent=Array.isArray(data.student_workflows) ? data.student_workflows[0] : data.student_workflows;
  try {const owners=await taskOwnerChoices(db,ctx,parent.student_id);
    if(!data.snapshot_json)return {error:"Preserve current plan settings on the student overview before editing this older plan."};
    return {step:{id:data.id,updated_at:data.updated_at,due_date:data.due_date,snapshot:data.snapshot_json as PlanSnapshot},owners};
  } catch {return {error:"Not authorized"};}
}
export async function savePlanStepEdit(stepId:string,expected:string,edit:unknown) {
  if(!z.string().uuid().safeParse(stepId).success || !z.string().datetime({offset:true}).safeParse(expected).success)return {error:"Invalid step revision"};
  const ctx=await resolveUserAndFirm();if(!ctx)return {error:"Not authenticated"};const db=getDb();
  const parsed=planEditSchema.safeParse(edit);if(!parsed.success)return {error:"Invalid plan settings"};
  const loaded=await getPlanStepEdit(stepId);if(!loaded.step)return {error:loaded.error};
  const current=loaded.step.snapshot;const patch=parsed.data;
  const ownerId=Object.hasOwn(patch,'owner') ? patch.owner : current.owner;
  const choice=ownerId ? loaded.owners.find(o=>o.id===ownerId) : null;
  if(ownerId && !choice)return {error:"Choose an eligible owner"};
  const {error}=await db.rpc("edit_plan_step",{p_firm:ctx.firmId,p_actor:ctx.dbUserId,p_step:stepId,p_expected:expected,
    p_edit:{title:patch.title ?? current.title,description:patch.description===undefined ? current.description : patch.description,
      priority:patch.priority ?? current.priority,owner:choice?.id ?? null,ownerRole:choice?.role ?? current.ownerRole,ownerReady:choice?.ready ?? false,
      ...(Object.hasOwn(patch,'due') ? {due:patch.due} : {})}});
  if(error)return {error:error.message};
  for(const path of ["/students","/tasks","/student-tasks","/family-tasks","/student-workflows","/family-workflows","/student-dashboard","/family-dashboard"]) revalidatePath(path,"layout");
  return {success:true};
}

/** Explicit, per-plan, repeatable legacy preservation; no date/owner/completion backfill. */
export async function preservePlanSettings(workflowId:string) {
  if(!z.string().uuid().safeParse(workflowId).success)return {error:"Invalid plan"};
  const ctx=await resolveUserAndFirm();if(!ctx)return {error:"Not authenticated"};
  const {error}=await getDb().rpc("freeze_plan_settings",{p_firm:ctx.firmId,p_actor:ctx.dbUserId,p_workflow:workflowId});
  if(error)return {error:error.message};
  revalidatePath("/students","layout");revalidatePath("/workflows","layout");return {success:true};
}
