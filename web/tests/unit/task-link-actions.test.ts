import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ role: "counselor", denied: false, writes: [] as Record<string, unknown>[] }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/resolve", () => ({ resolveUserAndFirm: async () => ({ dbUserId: "staff", firmId: "firm", role: state.role }), isStaffRole: (role: string) => role === "counselor" }));
vi.mock("@/lib/auth/task-access", async () => {
  const { AuthorizationError } = await import("@/lib/auth/authorize");
  return {
    requireTaskReadAccess: async () => ({ task: { student_id: "child", application_id: "existing-application", related_entity_type: null } }),
    requireTaskResourceAccess: async () => { if (state.denied) throw new AuthorizationError(); return {}; },
  };
});
vi.mock("@/lib/workflows/tasks-sync", () => ({}));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ from: () => {
  const q = { update: (row: Record<string, unknown>) => { state.writes.push(row); return q; }, eq: () => q, is: () => q, select: () => q, single: async () => ({ data: { id: "task" }, error: null }) }; return q;
} }) }));
import { linkTaskResource } from "@/lib/actions/tasks";
const essayId = "a0000000-0000-4000-8000-000000000099";
const form = (value: string) => { const data = new FormData(); data.set("resource", value); return data; };
beforeEach(() => { state.role = "counselor"; state.denied = false; state.writes = []; });
describe("task resource writes", () => {
  it("persists typed essay identity while preserving application context", async () => {
    expect(await linkTaskResource("task", form(`essay:${essayId}`))).toEqual({ success: true });
    expect(state.writes[0]).toMatchObject({ related_entity_type: "essay", related_entity_id: essayId, application_id: "existing-application" });
  });
  it("clears links only on an explicit unlink", async () => {
    await linkTaskResource("task", form(""));
    expect(state.writes[0]).toMatchObject({ related_entity_type: null, related_entity_id: null, application_id: null });
  });
  it("rejects unsupported kinds and malformed identifiers without writing", async () => {
    for (const value of [`secret:${essayId}`, "essay:wrong"]) expect(await linkTaskResource("task", form(value))).toHaveProperty("error");
    expect(state.writes).toHaveLength(0);
  });
  it("denies inaccessible resources and portal attempts before writing", async () => {
    state.denied = true;
    expect(await linkTaskResource("task", form(`essay:${essayId}`))).toHaveProperty("error");
    state.denied = false; state.role = "student";
    expect(await linkTaskResource("task", form(`essay:${essayId}`))).toHaveProperty("error");
    expect(state.writes).toHaveLength(0);
  });
});
