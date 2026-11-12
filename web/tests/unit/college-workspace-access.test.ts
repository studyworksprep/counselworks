import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthorizationError, requireCollegeWorkspaceAccess, type ActorContext } from "@/lib/auth/authorize";
import { EssayPromptSource } from "@/components/essays/prompt-source";

const id = "d1000000-0000-4000-8000-000000000001";
const college = { id, student_id: "child", college_id: "catalog" };
const ctx = (role: string): ActorContext => ({ role, firmId: "firm", dbUserId: "actor" });
function database(rows: Record<string, unknown>) {
  const filters: { table: string; key: string; value: unknown }[] = [];
  const from = vi.fn((table: string) => {
    const result = { data: rows[table] ?? null, error: null };
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters.push({ table, key, value }); return chain; },
      in: () => chain,
      limit: () => chain,
      maybeSingle: async () => result,
      then: (resolve: (result: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    return chain;
  });
  return { db: { from } as unknown as SupabaseClient, from, filters };
}

describe("college workspace access with the service-client fallback", () => {
  it("validates the UUID before querying and fails closed for a missing record", async () => {
    const { db, from } = database({});
    await expect(requireCollegeWorkspaceAccess(db, ctx("firm_owner"), "not-an-id")).rejects.toBeInstanceOf(AuthorizationError);
    expect(from).not.toHaveBeenCalled();
    await expect(requireCollegeWorkspaceAccess(db, ctx("firm_owner"), id)).rejects.toBeInstanceOf(AuthorizationError);
  });
  it("scopes the lookup to the firm and permits assigned staff", async () => {
    const { db, filters } = database({ student_colleges: college, student_staff_assignments: { id: "assignment" } });
    await expect(requireCollegeWorkspaceAccess(db, ctx("counselor"), id)).resolves.toEqual(college);
    expect(filters).toContainEqual({ table: "student_colleges", key: "firm_id", value: "firm" });
    expect(filters).toContainEqual({ table: "student_staff_assignments", key: "user_id", value: "actor" });
  });
  it("denies unassigned counselors and other students", async () => {
    for (const role of ["counselor", "student"]) {
      const { db } = database({ student_colleges: college, students: { id: "another-child" } });
      await expect(requireCollegeWorkspaceAccess(db, ctx(role), id)).rejects.toBeInstanceOf(AuthorizationError);
    }
  });
  it("allows the student and their household, and denies another household", async () => {
    const student = database({ student_colleges: college, students: { id: "child" } });
    await expect(requireCollegeWorkspaceAccess(student.db, ctx("student"), id)).resolves.toEqual(college);
    for (const child of ["child", "unrelated-child"]) {
      const { db } = database({ student_colleges: college, family_members: [{ family_id: "household" }], students: [{ id: child }] });
      const result = requireCollegeWorkspaceAccess(db, ctx("parent_guardian"), id);
      if (child === "child") await expect(result).resolves.toEqual(college);
      else await expect(result).rejects.toBeInstanceOf(AuthorizationError);
    }
  });
});

describe("assignment source snapshots", () => {
  const snapshot = { entry_year: 2027, source_url: "https://example.edu/original", verified_on: "2026-11-12", requirement: "optional", text_kind: "summary", word_limit: null, character_limit: 200 };
  it("shows the original source, correct limit unit and summary status", () => {
    const html = renderToStaticMarkup(createElement(EssayPromptSource, { snapshot }));
    expect(html).toContain("Fall 2027");
    expect(html).toContain("200 characters");
    expect(html).toContain("Prompt summary");
    expect(html).toContain('href="https://example.edu/original"');
    expect(html).not.toContain("200 words");
  });
  it("does not render malformed or unsafe snapshot URLs", () => {
    for (const value of [null, {}, { ...snapshot, source_url: "javascript:alert(1)" }]) {
      expect(renderToStaticMarkup(createElement(EssayPromptSource, { snapshot: value }))).toBe("");
    }
  });
});
