"use server";

import { getDb } from "../db/client";
import { resolveUserAndFirm, getAssignedStudentIds } from "../auth/resolve";
import { requireStaff } from "../auth/authorize";

export interface QuickFindResult {
  id: string;
  label: string;
  sublabel: string | null;
  href: string;
  kind: "student" | "family";
}

/**
 * Global quick-find (fix plan 8.4): jump to any student or family from
 * anywhere in the staff shell. Respects assignment scoping — a plain
 * counselor only finds their own clients, same as the list pages.
 */
export async function quickFind(
  query: string
): Promise<{ results: QuickFindResult[] } | { error: string }> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const term = query.trim();
  if (term.length < 2) return { results: [] };
  // Escape PostgREST pattern characters so user input can't break the filter.
  const like = `%${term.replace(/[%_,()]/g, "")}%`;

  const db = getDb();
  const scopedIds = await getAssignedStudentIds(ctx);
  if (scopedIds !== null && scopedIds.length === 0) return { results: [] };

  let studentsQuery = db
    .from("students")
    .select("id, first_name, last_name, graduation_year")
    .eq("firm_id", ctx.firmId)
    .is("archived_at", null)
    .or(`first_name.ilike.${like},last_name.ilike.${like}`)
    .limit(6);
  if (scopedIds !== null) studentsQuery = studentsQuery.in("id", scopedIds);

  const familiesQuery = db
    .from("families")
    .select("id, household_name, students(id)")
    .eq("firm_id", ctx.firmId)
    .is("archived_at", null)
    .ilike("household_name", like)
    .limit(6);

  const [students, families] = await Promise.all([
    studentsQuery,
    familiesQuery,
  ]);

  const scopedSet = scopedIds === null ? null : new Set(scopedIds);
  const results: QuickFindResult[] = [];
  for (const s of students.data ?? []) {
    results.push({
      id: s.id,
      kind: "student",
      label: `${s.first_name} ${s.last_name}`,
      sublabel: `Class of ${s.graduation_year}`,
      href: `/students/${s.id}`,
    });
  }
  for (const f of families.data ?? []) {
    // Scoped staff only see households containing an assigned student —
    // same rule as getFamilies.
    const studentIds = ((f as { students?: { id: string }[] }).students ?? []).map(
      (st) => st.id
    );
    if (scopedSet !== null && !studentIds.some((id) => scopedSet.has(id))) {
      continue;
    }
    results.push({
      id: f.id,
      kind: "family",
      label: f.household_name,
      sublabel: "Family",
      href: `/families/${f.id}`,
    });
  }
  return { results };
}
