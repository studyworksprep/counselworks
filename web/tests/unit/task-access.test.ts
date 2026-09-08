import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTaskReadAccess, requireTaskResourceAccess } from "@/lib/auth/task-access";
import type { ActorContext } from "@/lib/auth/authorize";
const id = "a0000000-0000-4000-8000-000000000043";
function fixture(changes: Record<string, unknown> = {}) {
  const tables: Record<string, Record<string, unknown>[]> = {
    tasks: [{ id, firm_id: "firm", student_id: "child", assigned_user_id: "staff", created_by_user_id: "staff", visibility_scope: "family", owner_pending: false, archived_at: null, ...changes }],
    students: [{ id: "child", user_id: "student", firm_id: "firm", family_id: "family" }],
    family_members: [{ user_id: "parent1", firm_id: "firm", family_id: "family" }, { user_id: "parent2", firm_id: "firm", family_id: "family" }],
    student_staff_assignments: [{ id: "assignment", firm_id: "firm", user_id: "staff", student_id: "child" }],
    essay_drafts: [{ id: "shared", firm_id: "firm", student_id: "child", title: "Shared essay", visibility_scope: "student" }, { id: "private", firm_id: "firm", student_id: "child", title: "Private strategy", visibility_scope: "staff" }],
    documents: [{ id: "doc", firm_id: "firm", student_id: "child", visibility_scope: "family", archived_at: null }, { id: "archived", firm_id: "firm", student_id: "child", visibility_scope: "family", archived_at: "2026-01-01" }],
    applications: [{ id: "app", firm_id: "firm", student_id: "child", colleges: { name: "College" } }],
    document_requests: [{ id: "request", firm_id: "firm", student_id: "child", family_id: "family", title: "Transcript", status: "requested" }, { id: "other-request", firm_id: "firm", student_id: "other-child", family_id: "other-family", title: "Private request", status: "requested" }],
  };
  return { from(table: string) {
    let rows = tables[table] ?? [];
    const q = {
      select() { return q; }, eq(key: string, value: unknown) { rows = rows.filter(r => r[key] === value); return q; },
      is(key: string, value: unknown) { return q.eq(key, value); }, limit(n: number) { rows = rows.slice(0, n); return q; },
      in(key: string, values: unknown[]) { rows = rows.filter(r => values.includes(r[key])); return q; },
      maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
      then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
    }; return q;
  } } as unknown as SupabaseClient;
}
const actor = (dbUserId: string, role: string): ActorContext => ({ dbUserId, role, firmId: "firm" });
const student = actor("student", "student"); const staff = actor("staff", "counselor"); const parent = actor("parent1", "parent_guardian");
describe("task UUID access", () => {
  it("allows the actual audience to read counselor-owned shared work", async () => {
    for (const ctx of [student, staff, parent]) expect((await requireTaskReadAccess(fixture(), ctx, id)).task.id).toBe(id);
  });
  it("denies other firms, unassigned staff, unrelated students, and malformed ids", async () => {
    for (const ctx of [{ ...staff, firmId: "other" }, actor("unassigned", "counselor"), actor("other-student", "student")]) await expect(requireTaskReadAccess(fixture(), ctx, id)).rejects.toThrow();
    await expect(requireTaskReadAccess(fixture(), staff, "malformed")).rejects.toThrow();
  });
  it("keeps unpublished, archived, and hidden work out of portal detail routes", async () => {
    for (const changes of [{ owner_pending: true }, { archived_at: "2026-01-01" }, { visibility_scope: "staff" }]) await expect(requireTaskReadAccess(fixture(changes), student, id)).rejects.toThrow();
    await expect(requireTaskReadAccess(fixture({ owner_pending: true }), staff, id)).resolves.toBeTruthy();
  });
});
describe("task resource isolation", () => {
  it("resolves the existing student essay editor and staff editor", async () => {
    expect((await requireTaskResourceAccess(fixture(), student, "child", "essay", "shared")).href).toBe("/student-essays/shared");
    expect((await requireTaskResourceAccess(fixture(), staff, "child", "essay", "private")).href).toBe("/essays/private");
  });
  it("a shared task does not disclose private essay titles or grant a parent essay access", async () => {
    await expect(requireTaskResourceAccess(fixture(), student, "child", "essay", "private")).rejects.toThrow();
    await expect(requireTaskResourceAccess(fixture(), parent, "child", "essay", "shared")).rejects.toThrow();
  });
  it("rejects archived documents and another student's request/application", async () => {
    await expect(requireTaskResourceAccess(fixture(), student, "child", "document", "archived")).rejects.toThrow();
    await expect(requireTaskResourceAccess(fixture(), student, "child", "document_request", "other-request")).rejects.toThrow();
    await expect(requireTaskResourceAccess(fixture(), student, "other-child", "application", "app")).rejects.toThrow();
  });
  it("keeps exact request and application identity in existing portal routes", async () => {
    expect((await requireTaskResourceAccess(fixture(), parent, "child", "document_request", "request")).href).toBe("/family-documents#request-request");
    expect((await requireTaskResourceAccess(fixture(), student, "child", "application", "app")).href).toBe("/student-applications#application-app");
  });
});
