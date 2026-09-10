import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeTaskView } from "@/lib/constants/tasks";
const state = vi.hoisted(() => ({ role: "counselor" }));
vi.mock("@/lib/auth/resolve", () => ({
  resolveUserAndFirm: async () => ({ dbUserId: "carl", firmId: "alpha", role: state.role }),
  getAssignedStudentIds: async () => state.role === "firm_owner" ? null : ["sam"],
  STAFF_ROLE_LIST: ["firm_owner", "counselor"],
}));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ from(table: string) {
  const task = { firm_id: "alpha", student_id: "sam", archived_at: null, title: "Task", students: { id: "sam", first_name: "Sam", last_name: "Test" } };
  let rows: Record<string, unknown>[] = table === "students" ? [{ id: "sam", firm_id: "alpha", family_id: "a0000000-0000-4000-8000-000000000031" }] : [
    ...["carl", "sam", "parent", "other-staff"].map(id => ({ ...task, id, assigned_user_id: id, assigned_user: { id, first_name: id, last_name: "Test" } })),
    { ...task, id: "foreign", firm_id: "beta", assigned_user_id: "carl" },
    { ...task, id: "archived", archived_at: "2026-01-01", assigned_user_id: "carl" },
    { ...task, id: "unassigned-student", student_id: "other-child", assigned_user_id: "carl" },
    { ...task, id: "own-firm", student_id: null, assigned_user_id: "carl" },
    { ...task, id: "other-firm-task", student_id: null, assigned_user_id: "other-staff" },
  ];
  const q = {
    select: () => q, order: () => q,
    eq: (k: string, v: unknown) => { rows = rows.filter(r => r[k] === v); return q; },
    is: (k: string, v: unknown) => q.eq(k, v),
    in: (k: string, vs: unknown[]) => { rows = rows.filter(r => vs.includes(r[k])); return q; },
    not: (k: string, _op: string, v: unknown) => { rows = rows.filter(r => r[k] !== v); return q; },
    or: (filter: string) => {
      // Evaluate the actual caseload and own-firm-task predicate produced by getTasks.
      const students = filter.match(/student_id.in.\(([^)]+)\)/)?.[1].split(",") ?? [];
      const actor = filter.match(/assigned_user_id.eq.([^,)]+)/)?.[1];
      rows = rows.filter(r => students.includes(String(r.student_id)) || (r.student_id === null && (r.assigned_user_id === actor || r.created_by_user_id === actor)));
      return q;
    },
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
  }; return q;
} }) }));
import { getTasks } from "@/lib/db/queries";
beforeEach(() => { state.role = "counselor"; });
describe("global task URL ownership and embedded scope", () => {
  it.each([undefined, null, "", "invalid", "my", ["my", "team"]])("defaults %j to the counselor's own authorized assignments", async view => {
    expect((await getTasks({ view: normalizeTaskView(view) })).map(t => t.id)).toEqual(["carl", "own-firm"]);
  });
  it("preserves explicit Team and Student scopes within the counselor caseload", async () => {
    expect(normalizeTaskView(["team", "my"])).toBe("team");
    expect((await getTasks({ view: normalizeTaskView("team") })).map(t => t.id)).toEqual(["carl", "sam", "parent", "other-staff", "own-firm"]);
    expect((await getTasks({ view: normalizeTaskView("student") })).map(t => t.id)).toEqual(["carl", "sam", "parent", "other-staff"]);
  });
  it("leaves omitted embedded filters broad and preserves student/family restrictions", async () => {
    for (const filters of [{ studentId: "sam" }, { familyId: "a0000000-0000-4000-8000-000000000031" }]) {
      expect((await getTasks(filters)).map(t => t.id)).toEqual(["carl", "sam", "parent", "other-staff"]);
    }
    expect(await getTasks({ studentId: "other-child" })).toEqual([]);
    expect(await getTasks({ familyId: "b0000000-0000-4000-8000-000000000031" })).toEqual([]);
    expect(await getTasks()).toHaveLength(5);
  });
  it("keeps firm-wide staff tenancy even with broader caseload permission", async () => {
    state.role = "firm_owner";
    const tasks = await getTasks({ view: "team" });
    expect(tasks.map(t => t.id)).toContain("unassigned-student");
    expect(tasks.map(t => t.id)).not.toContain("foreign");
    expect(tasks.map(t => t.id)).not.toContain("archived");
  });
});
