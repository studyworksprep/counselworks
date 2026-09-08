import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveTaskOwner } from "@/lib/auth/task-owner";

/** In-memory relational fixture: filters run, so foreign and inactive rows cannot accidentally pass. */
function fixture(studentUser: string | null = "student-user", placeholder = false) {
  const user = (id: string) => ({ first_name: id, last_name: "Test", auth_provider_user_id: placeholder && id === "student-user" ? "invited_student" : `user_${id}` });
  const tables: Record<string, Record<string, unknown>[]> = {
    firm_memberships: [
      ...["actor", "staff", "unassigned"].map(id => ({ user_id: id, firm_id: "firm", status: "active", role: "counselor", users: user(id) })),
      ...["parent1", "parent2"].map(id => ({ user_id: id, firm_id: "firm", status: "active", role: "parent_guardian", users: user(id) })),
      { user_id: "student-user", firm_id: "firm", status: "active", role: "student", users: user("student-user") },
      { user_id: "foreign", firm_id: "other", status: "active", role: "counselor", users: user("foreign") },
    ],
    students: [{ id: "child", firm_id: "firm", user_id: studentUser, family_id: "family", archived_at: null, first_name: "Test", last_name: "Child" }],
    student_staff_assignments: ["actor", "staff"].map(id => ({ id, firm_id: "firm", student_id: "child", user_id: id, assignment_type: id === "actor" ? "counselor" : "essay_coach", is_primary: id === "actor" })),
    family_members: ["parent1", "parent2"].map(user_id => ({ firm_id: "firm", family_id: "family", user_id })),
  };
  return { from(table: string) {
    let rows = tables[table] ?? [];
    const q = {
      select() { return q; }, eq(key: string, value: unknown) { rows = rows.filter(r => r[key] === value); return q; },
      is(key: string, value: unknown) { return q.eq(key, value); }, limit(n: number) { rows = rows.slice(0, n); return q; },
      maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
    };
    return q;
  } } as unknown as SupabaseClient;
}
const input = { firmId: "firm", studentId: "child", actingUserId: "actor" };
describe("shared task owner resolver", () => {
  it("resolves student work to the linked student, not its counselor", async () => {
    expect(await resolveTaskOwner(fixture(), { ...input, role: "student" })).toEqual({ userId: "student-user", role: "student", ready: true });
  });
  it("preserves unresolved student intent when unlinked or invited", async () => {
    expect(await resolveTaskOwner(fixture(null), { ...input, role: "student" })).toEqual({ userId: null, role: "student", ready: false });
    expect((await resolveTaskOwner(fixture("student-user", true), { ...input, role: "student" })).ready).toBe(false);
  });
  it("never picks either parent implicitly", async () => {
    expect((await resolveTaskOwner(fixture(), { ...input, role: "parent_guardian" })).userId).toBeNull();
    expect((await resolveTaskOwner(fixture(), { ...input, userId: "parent2" })).userId).toBe("parent2");
  });
  it("rejects unassigned staff, other firms, unrelated students and portal actors", async () => {
    for (const userId of ["unassigned", "foreign"]) await expect(resolveTaskOwner(fixture(), { ...input, userId })).rejects.toThrow();
    await expect(resolveTaskOwner(fixture(), { ...input, studentId: "foreign-child" })).rejects.toThrow();
    await expect(resolveTaskOwner(fixture(), { ...input, actingUserId: "parent1" })).rejects.toThrow();
  });
  it("resolves staff roles from the child's assignments", async () => {
    expect((await resolveTaskOwner(fixture(), { ...input, role: "essay_coach" })).userId).toBe("staff");
  });
});
