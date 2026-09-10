import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canRecoverTaskWorkflow, hasRecoverableWorkflowTasks } from "@/lib/auth/task-recovery";
import type { ActorContext } from "@/lib/auth/authorize";
const ctx = (role: string) => ({role,firmId:"alpha",dbUserId:"actor"}) as ActorContext;
function database(missing: boolean, linked = true, workflowStatus = "in_progress") {
  const calls: unknown[] = [];
  const db = { from(table: string) {
    calls.push(table); let match=true;
    const q = {
      select: () => q,
      eq: (key: string,value: string) => { calls.push([key,value]); return q; },
      in: (key: string,values: string[]) => { if(key === "student_workflows.status") match=values.includes(workflowStatus); return q; },
      is: (key: string,value: null) => { calls.push([key,value]); return q; }, limit: () => q,
      maybeSingle: async () => ({data:linked ? {student_workflow_id:"workflow"} : null,error:null}),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({data:missing && match ? [{id:"missing"}] : [],error:null}).then(resolve),
    };return q;
  }} as unknown as SupabaseClient;
  return {db,calls};
}
describe("explicit workflow recovery", () => {
  it.each(["student","parent_guardian","read_only_staff","tutor"])("denies %s without querying private workflow state", async role => {
    const {db,calls}=database(true);
    expect(await canRecoverTaskWorkflow(db,ctx(role),"task")).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it("requires an active workflow with an actionable unmaterialized step", async () => {
    expect(await canRecoverTaskWorkflow(database(true,false).db,ctx("counselor"),"task")).toBe(false);
    expect(await hasRecoverableWorkflowTasks(database(false).db,ctx("counselor"),"workflow")).toBe(false);
    expect(await hasRecoverableWorkflowTasks(database(true,true,"paused").db,ctx("counselor"),"workflow")).toBe(false);
    const {db,calls}=database(true);
    expect(await canRecoverTaskWorkflow(db,ctx("counselor"),"task")).toBe(true);
    expect(calls).toContainEqual(["student_workflows.firm_id","alpha"]);
    expect(calls).toContainEqual(["linked_task_id",null]);
  });
});
