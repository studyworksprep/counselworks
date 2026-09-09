import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ actor: "student", role: "student", updates: 0,
  task: { id: "task", student_id: "child", visibility_scope: "family", assigned_user_id: "counselor", created_by_user_id: "counselor", status: "pending", task_type: "general", owner_pending: false, completion_mode: "simple", dependency_blocked: false, needs_attention: false } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/resolve", () => ({
  resolveUserAndFirm: async () => ({ dbUserId: state.actor, firmId: "firm", role: state.role }),
  isStaffRole: (role: string) => ["counselor", "firm_owner"].includes(role),
  isFirmWideRole: (role: string) => role === "firm_owner",
}));
vi.mock("@/lib/workflows/tasks-sync", () => ({ reconcileTaskWorkflow: async () => ({ error: null }), unlinkTaskFromAnyStep: async () => ({ error: null }) }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ rpc: async () => { state.updates++; return { error: null }; }, from(table: string) {
  let writing = false;
  const q = { select: () => q, eq: () => q, is: () => q, in: () => q, limit: () => q,
    update: () => { writing = true; state.updates++; return q; },
    single: () => Promise.resolve({ data: { id: "task" }, error: null }),
    maybeSingle: () => Promise.resolve({ data: table === "tasks" ? state.task : { id: "child" }, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: writing ? null : table === "family_members" ? [{ family_id: "family" }] : [{ id: "child" }], error: null }).then(resolve),
  }; return q;
} }) }));
import { updateTaskStatus } from "@/lib/actions/tasks";
beforeEach(() => { state.actor = "student"; state.role = "student"; state.updates = 0; state.task.assigned_user_id = "counselor"; state.task.task_type = "general"; state.task.owner_pending = false; state.task.completion_mode = "simple"; state.task.dependency_blocked = false; state.task.needs_attention = false; });
describe("direct task server-action authorization", () => {
  it("denies the student completing a visible counselor task", async () => {
    expect(await updateTaskStatus("task", "completed")).toHaveProperty("error");
    expect(state.updates).toBe(0);
  });
  it("allows the actual student owner", async () => {
    state.task.assigned_user_id = "student";
    expect(await updateTaskStatus("task", "completed")).toEqual({ success: true });
    expect(state.updates).toBe(1);
  });
  it("allows only the specifically selected parent", async () => {
    state.role = "parent_guardian"; state.actor = "parent1"; state.task.assigned_user_id = "parent2";
    expect(await updateTaskStatus("task", "completed")).toHaveProperty("error");
    expect(state.updates).toBe(0);
    state.actor = "parent2";
    expect(await updateTaskStatus("task", "completed")).toEqual({ success: true });
  });
  it("denies review approval, unpublished work, and forged statuses before writing", async () => {
    state.task.assigned_user_id = "student"; state.task.task_type = "review";
    expect(await updateTaskStatus("task", "completed")).toHaveProperty("error");
    state.task.task_type = "general"; state.task.owner_pending = true;
    expect(await updateTaskStatus("task", "completed")).toHaveProperty("error");
    state.task.owner_pending = false;
    expect(await updateTaskStatus("task", "approved")).toHaveProperty("error");
    expect(state.updates).toBe(0);
  });
});

it("cannot bypass deliverables or prerequisites through generic completion", async () => {
  state.task.assigned_user_id = "student";
  for (const mode of ["evidence", "review_required"]) {
    state.task.completion_mode = mode;
    expect(await updateTaskStatus("task", "completed")).toHaveProperty("error");
  }
  state.task.completion_mode = "simple";
  state.task.dependency_blocked = true;
  expect(await updateTaskStatus("task", "completed")).toHaveProperty("error");
  state.task.dependency_blocked = false; state.task.needs_attention = true;
  expect(await updateTaskStatus("task", "completed")).toHaveProperty("error");
  expect(state.updates).toBe(0);
});
