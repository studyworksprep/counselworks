import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ reviewer: "staff", inaccessible: false, rpcError: null as null | {message:string}, syncError: null as null | Error, calls: [] as unknown[] }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/resolve", () => ({ resolveUserAndFirm: async () => ({ firmId: "firm", dbUserId: "staff", role: "counselor" }), isStaffRole: () => true }));
vi.mock("@/lib/auth/authorize", () => ({ AuthorizationError: class extends Error {}, requireStaff: () => {}, requireTaskMutation: async () => ({}) }));
vi.mock("@/lib/auth/task-access", () => ({ requireTaskReadAccess: async () => ({ task: { student_id: "student", related_entity_type: "essay", related_entity_id: "essay", reviewer_user_id: state.reviewer } }), requireTaskResourceAccess: async () => { if (state.inaccessible) throw new Error("denied"); } }));
vi.mock("@/lib/workflows/tasks-sync", () => ({ reconcileTaskWorkflow: async () => ({ error: state.syncError }) }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ rpc: async (...args: unknown[]) => { state.calls.push(args); return { error: state.rpcError }; } }) }));
import { actOnTaskDeliverable } from "@/lib/actions/tasks";
const version = "a0000000-0000-4000-8000-000000000099";
beforeEach(() => { state.reviewer="staff"; state.inaccessible=false; state.rpcError=null; state.syncError=null; state.calls=[]; });
it("passes the displayed version to the atomic review transaction", async () => {
  expect(await actOnTaskDeliverable("task","approved",version)).toEqual({success:true});
  expect(state.calls[0]).toEqual(["transition_task", expect.objectContaining({p_expected:version,p_task:"task",p_actor:"staff",p_firm:"firm"})]);
});
it("does not write when the reviewer or artifact access is wrong", async () => {
  state.reviewer="someone-else";
  expect(await actOnTaskDeliverable("task","approved",version)).toHaveProperty("error");
  state.reviewer="staff"; state.inaccessible=true;
  expect(await actOnTaskDeliverable("task","approved",version)).toHaveProperty("error");
  expect(state.calls).toHaveLength(0);
});
it("surfaces a stale-version transaction failure", async () => {
  state.rpcError={message:"Submission changed. Refresh before reviewing"};
  expect(await actOnTaskDeliverable("task","approved",version)).toEqual({error:state.rpcError.message});
});
it("keeps materialization failures retryable without replaying the approval", async () => {
  state.syncError=new Error("unavailable");
  expect(await actOnTaskDeliverable("task","approved",version)).toHaveProperty("error",expect.stringContaining("saved"));
  state.syncError=null; state.calls=[];
  expect(await actOnTaskDeliverable("task","retry")).toEqual({success:true});
  expect(state.calls).toHaveLength(0);
});
