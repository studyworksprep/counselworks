import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_PERMISSIONS } from "@/modules/permissions/service";
import type { ActorContext } from "./authorize";

/** Call only after authorizing access to the task/workflow's student. Recovery
 * materializes other people's work, so portal read access is insufficient. */
export async function hasRecoverableWorkflowTasks(db: SupabaseClient, ctx: ActorContext, workflowId: string) {
  if (!ROLE_PERMISSIONS[ctx.role]?.includes("edit_task")) return false;
  const { data, error } = await db.from("student_workflow_steps")
    .select("id, student_workflows!inner(firm_id, status)")
    .eq("student_workflow_id", workflowId).eq("student_workflows.firm_id", ctx.firmId)
    .in("student_workflows.status", ["not_started", "in_progress"])
    .in("status", ["pending", "in_progress"]).is("linked_task_id", null).limit(1);
  if (error) throw new Error("Unable to check workflow recovery");
  return !!data?.length;
}

export async function canRecoverTaskWorkflow(db: SupabaseClient, ctx: ActorContext, taskId: string) {
  if (!ROLE_PERMISSIONS[ctx.role]?.includes("edit_task")) return false;
  const { data, error } = await db.from("student_workflow_steps")
    .select("student_workflow_id, student_workflows!inner(firm_id)")
    .eq("linked_task_id", taskId).eq("student_workflows.firm_id", ctx.firmId).maybeSingle();
  if (error) throw new Error("Unable to check task recovery");
  return data ? hasRecoverableWorkflowTasks(db, ctx, data.student_workflow_id) : false;
}
