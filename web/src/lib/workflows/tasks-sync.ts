import { resolveTaskOwner } from "../auth/task-owner";
import type { SupabaseClient } from "@supabase/supabase-js";
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
  snapshot_json: {owner:string|null;ownerRole:string;ownerReady:boolean} | null;
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
    default_assignee_role: string | null;
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
      `id, linked_task_id, snapshot_json, title, description, assigned_user_id, due_date,
       student_workflows!inner(firm_id, student_id, created_by_user_id),
       workflow_template_steps!inner(name, description, task_type, visibility_scope, default_assignee_role)`,
    )
    .eq("id", stepId).eq("student_workflows.firm_id", ctx.firmId)
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
  let owner;
  try {
    owner = await resolveTaskOwner(db, { firmId: ctx.firmId, studentId: row.student_workflows.student_id,
      actingUserId: createdBy, role: row.snapshot_json?.ownerRole ?? row.workflow_template_steps.default_assignee_role, userId: row.assigned_user_id ?? row.snapshot_json?.owner });
  } catch (error) { return { taskId: null, error: error instanceof Error ? error : new Error("Owner resolution failed") }; }
  if(row.snapshot_json && !row.snapshot_json.owner && !row.assigned_user_id) owner={userId:null,role:row.snapshot_json.ownerRole,ready:false};
  const { data: taskId, error: createError } = await db.rpc("materialize_workflow_task", {
    p_step: stepId, p_firm: ctx.firmId, p_actor: ctx.dbUserId,
    p_owner: owner.userId, p_role: owner.role, p_ready: owner.ready,
  });
  return { taskId, error: createError };

}

// ---------------------------------------------------------------------------
// Task changes that should propagate back to the workflow step.
// ---------------------------------------------------------------------------

/**
 * Reconcile and retry downstream task creation after any accepted transition.
 * Task/step state was already committed atomically by the database.
 */
export async function reconcileTaskWorkflow(
  db: SupabaseClient,
  taskId: string,
  ctx: SyncContext,
): Promise<{ error: Error | null }> {
  const { data: step, error } = await db.from("student_workflow_steps")
    .select("id, student_workflow_id, student_workflows!inner(firm_id)")
    .eq("linked_task_id", taskId).eq("student_workflows.firm_id", ctx.firmId).maybeSingle();
  if (error) return { error };
  if (!step) return { error: null };
  // The database transition already synchronized task/step atomically. Retrying
  // only reconciles and materializes; it must never turn a submission complete.
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
  const { error } = await db.rpc("reconcile_workflow", { p_workflow: workflowId, p_firm: ctx.firmId, p_actor: ctx.dbUserId });
  if (error) return { error };
  return materializeTasksForNewWorkflow(db, workflowId, ctx);

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
    .select("id, status, linked_task_id, student_workflows!inner(firm_id)")
    .eq("student_workflow_id", workflowId).eq("student_workflows.firm_id", ctx.firmId);
  if (error) return { error };

  for (const step of steps ?? []) {
    if (!["pending", "in_progress"].includes(step.status) || step.linked_task_id) continue;
    const { error: matErr } = await materializeTaskForStep(db, step.id, ctx);
    if (matErr) return { error: matErr };
  }
  return { error: null };
}
