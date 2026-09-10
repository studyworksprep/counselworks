import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/resolve", () => ({ resolveUserAndFirm: async () => ({ dbUserId: "user", firmId: "firm", role: "student" }), STAFF_ROLE_LIST: [] }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ from(table: string) {
  const visible = { firm_id: "firm", student_id: "child", owner_pending: false, archived_at: null, visibility_scope: "student", status: "pending", due_at: "2020-01-01", assigned_user_id: "user", task_type: "general" };
  const tables: Record<string, Record<string, unknown>[]> = {
    students: [{ id: "child", user_id: "user", firm_id: "firm" }],
    tasks: [...Array.from({ length: 15 }, (_, i) => ({ ...visible, id: String(i) })),
      { ...visible, id: "counselor-owned", assigned_user_id: "counselor", owner_role: "counselor" },
      { ...visible, id: "parent-owned", assigned_user_id: "parent", owner_role: "parent", status: "changes_requested" },
      { ...visible, id: "hidden", visibility_scope: "staff" },
      { ...visible, id: "archived", archived_at: "2020-01-01" },
      { ...visible, id: "draft", owner_pending: true },
      { ...visible, id: "other", firm_id: "other" }],
    student_colleges: [1, 2, 3].map(id => ({ id, firm_id: "firm", student_id: "child" })),
    applications: [{ id: 1, firm_id: "firm", student_id: "child", stage: "draft" }], meetings: [],
  };
  let rows = tables[table] ?? []; let cap = Infinity;
  const q = {
    select: () => q,
    eq: (key: string, value: unknown) => { rows = rows.filter(r => r[key] === value); return q; },
    neq: (key: string, value: unknown) => { rows = rows.filter(r => r[key] !== value); return q; },
    is: (key: string, value: unknown) => q.eq(key, value),
    in: (key: string, values: unknown[]) => { rows = rows.filter(r => values.includes(r[key])); return q; },
    lt: (key: string, value: string) => { rows = rows.filter(r => String(r[key]) < value); return q; },
    or: () => { rows = rows.filter(r => r.assigned_user_id !== "user"); return q; },
    gte: () => q, order: () => q, limit: (n: number) => { cap = n; return q; },
    single: () => Promise.resolve({ data: rows[0], error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows.slice(0, cap), count: rows.length, error: null }).then(resolve),
  }; return q;
} }) }));
import { getStudentPortalData, getStudentTasks } from "@/lib/db/queries";
describe("portal task totals", () => {
  it("counts all authorized open tasks independently of the ten-row preview", async () => {
    const dashboard = await getStudentPortalData();
    const tasks = await getStudentTasks();
    expect(dashboard?.tasks).toHaveLength(10);
    expect(dashboard?.totalTasks).toBe(15);
    expect(dashboard?.overdueTasks).toBe(15);
    expect(tasks).toHaveLength(17);
    expect(dashboard?.totalWaitingTasks).toBe(2);
    expect(dashboard?.waitingTasks.map(t => t.id)).toEqual(["counselor-owned", "parent-owned"]);
    expect(dashboard?.totalSchools).toBe(3);
    expect(dashboard?.applications).toHaveLength(1);
  });
});
