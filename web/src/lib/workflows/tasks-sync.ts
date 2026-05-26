import type { SupabaseClient } from "@supabase/supabase-js";
import {
  activateSteps,
  completeStudentWorkflowStep,
  getStepsByTemplate,
  getStudentWorkflowWithSteps,
  resolveActivatableStepIds,
} from "@/modules/workflows";

export interface SyncContext {
  dbUserId: string;
  firmId: string;
}

// ---------------------------------------------------------------------------
// Step -> Task: create the task that represents an active workflow step.
// ---------------------------------------------------------------------------

interface MaterializeRow {
  id: string;
  linked_task_id: string | null;
  title: string | null;
  description: string | null;
  assigned_user_id: string | null;
  due_date: string | null;
  student_workflows: {
    firm_id: string;
    student_id: string;
    created_by_user_id: string | null;
  };
  workflow_template_steps: {
    name: string;
    description: string | null;
    task_type: string | null;
    visibility_scope: string;
  };
}

/**
 * Idempotent. If the step already has a linked task, returns its id without
 * creating another. Otherwise inserts a tasks row mirroring the step's
 * title/description/assignee/due date and stores the new task id on the step.
 */
export async function materializeTaskForStep(
  db: SupabaseClient,
  stepId: string,
  ctx: SyncContext,
): Promise<{ taskId: string | null; error: Error | null }> {
  const { data, error } = await db
    .from("student_workflow_steps")
    .select(
      `id, linked_task_id, title, description, assigned_user_id, due_date,
       student_workflows!inner(firm_id, student_id, created_by_user_id),
       workflow_template_steps!inner(name, description, task_type, visibility_scope)`,
    )
    .eq("id", stepId)
    .single();

  if (error || !data) {
    return { taskId: null, error: error ?? new Error("Step not found") };
  }

  const row = data as unknown as MaterializeRow;

  if (row.student_workflows.firm_id !== ctx.firmId) {
    return { taskId: null, error: new Error("Forbidden") };
  }

  if (row.linked_task_id) {
    return { taskId: row.linked_task_id, error: null };
  }

  const createdBy = row.student_workflows.created_by_user_id ?? ctx.dbUserId;
  const dueAt = row.due_date ? `${row.due_date}T00:00:00.000Z` : null;

  const { data: task, error: insertError } = await db
    .from("tasks")
    .insert({
      firm_id: row.student_workflows.firm_id,
      title: row.title ?? row.workflow_template_steps.name,
      description:
        row.description ?? row.workflow_template_steps.description ?? null,
      task_type: row.workflow_template_steps.task_type ?? "workflow_step",
      status: "pending",
      priority: "medium",
      visibility_scope: row.workflow_template_steps.visibility_scope ?? "staff",
      assigned_user_id: row.assigned_user_id ?? createdBy,
      student_id: row.student_workflows.student_id,
      due_at: dueAt,
      created_by_user_id: createdBy,
      updated_by_user_id: createdBy,
    })
    .select("id")
    .single();

  if (insertError || !task) {
    return { taskId: null, error: insertError ?? new Error("Failed to create task") };
  }

  const { error: linkError } = await db
    .from("student_workflow_steps")
    .update({ linked_task_id: task.id, updated_at: new Date().toISOString() })
    .eq("id", stepId);

  if (linkError) return { taskId: null, error: linkError };
  return { taskId: task.id, error: null };
}

// ---------------------------------------------------------------------------
// Step status changes that should propagate to the linked task.
// ---------------------------------------------------------------------------

export async function markLinkedTaskCompleted(
  db: SupabaseClient,
  stepId: string,
  ctx: SyncContext,
): Promise<{ error: Error | null }> {
  const { data: step } = await db
    .from("student_workflow_steps")
    .select("linked_task_id")
    .eq("id", stepId)
    .single();
  if (!step?.linked_task_id) return { error: null };

  const now = new Date().toISOString();
  const { error } = await db
    .from("tasks")
    .update({
      status: "completed",
      completed_at: now,
      updated_at: now,
      updated_by_user_id: ctx.dbUserId,
    })
    .eq("id", step.linked_task_id)
    .eq("firm_id", ctx.firmId);

  return { error };
}

export async function archiveLinkedTask(
  db: SupabaseClient,
  stepId: string,
  ctx: SyncContext,
): Promise<{ error: Error | null }> {
  const { data: step } = await db
    .from("student_workflow_steps")
    .select("linked_task_id")
    .eq("id", stepId)
    .single();
  if (!step?.linked_task_id) return { error: null };

  const now = new Date().toISOString();
  const { error } = await db
    .from("tasks")
    .update({
      archived_at: now,
      updated_at: now,
      updated_by_user_id: ctx.dbUserId,
    })
    .eq("id", step.linked_task_id)
    .eq("firm_id", ctx.firmId);

  if (error) return { error };

  await db
    .from("student_workflow_steps")
    .update({ linked_task_id: null, updated_at: now })
    .eq("id", stepId);

  return { error: null };
}

// ---------------------------------------------------------------------------
// Task changes that should propagate back to the workflow step.
// ---------------------------------------------------------------------------

/**
 * Mirrors a task completion onto its linked workflow step (if any), then
 * activates downstream blocked steps and materializes their tasks. Idempotent.
 */
export async function completeStepForCompletedTask(
  db: SupabaseClient,
  taskId: string,
  ctx: SyncContext,
): Promise<{ error: Error | null }> {
  const { data: step } = await db
    .from("student_workflow_steps")
    .select("id, status, student_workflow_id")
    .eq("linked_task_id", taskId)
    .maybeSingle();

  if (!step) return { error: null };
  if (step.status === "completed") return { error: null };

  const { error: stepError } = await completeStudentWorkflowStep(
    db,
    step.id,
    ctx.dbUserId,
  );
  if (stepError) return { error: stepError };

  return runStepActivationAndMaterialize(db, step.student_workflow_id, ctx);
}

/**
 * Called when a task is archived directly via the tasks UI — drops the step's
 * pointer so a future activation can materialize a fresh task.
 */
export async function unlinkTaskFromAnyStep(
  db: SupabaseClient,
  taskId: string,
): Promise<{ error: Error | null }> {
  const { error } = await db
    .from("student_workflow_steps")
    .update({ linked_task_id: null, updated_at: new Date().toISOString() })
    .eq("linked_task_id", taskId);
  return { error };
}

// ---------------------------------------------------------------------------
// Activation chain: re-evaluate dependencies, flip blocked->pending, create
// tasks for newly activated steps. Used after every step completion/skip.
// ---------------------------------------------------------------------------

export async function runStepActivationAndMaterialize(
  db: SupabaseClient,
  workflowId: string,
  ctx: SyncContext,
): Promise<{ error: Error | null }> {
  const { data: workflow } = await getStudentWorkflowWithSteps(db, workflowId);
  if (!workflow) return { error: null };

  // Ad-hoc workflows have no template, hence no dependency graph.
  if (!workflow.workflow_template_id) return { error: null };

  const { data: templateSteps } = await getStepsByTemplate(
    db,
    workflow.workflow_template_id,
  );

  const activatable = resolveActivatableStepIds(
    workflow.student_workflow_steps,
    templateSteps,
  );
  if (activatable.length === 0) return { error: null };

  const { error: activateErr } = await activateSteps(db, activatable);
  if (activateErr) return { error: activateErr };

  for (const stepId of activatable) {
    const { error } = await materializeTaskForStep(db, stepId, ctx);
    if (error) return { error };
  }
  return { error: null };
}

/**
 * Materializes tasks for every non-blocked step in a freshly instantiated
 * workflow. Called once right after `instantiateWorkflowFromTemplate`.
 */
export async function materializeTasksForNewWorkflow(
  db: SupabaseClient,
  workflowId: string,
  ctx: SyncContext,
): Promise<{ error: Error | null }> {
  const { data: steps, error } = await db
    .from("student_workflow_steps")
    .select("id, status, linked_task_id")
    .eq("student_workflow_id", workflowId);
  if (error) return { error };

  for (const step of steps ?? []) {
    if (step.status === "blocked" || step.linked_task_id) continue;
    const { error: matErr } = await materializeTaskForStep(db, step.id, ctx);
    if (matErr) return { error: matErr };
  }
  return { error: null };
}
