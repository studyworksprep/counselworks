"use server";

import { getDb } from "../db/client";
import { resolveUserAndFirm, getAssignedStudentIds } from "../auth/resolve";
import { requireStaff } from "../auth/authorize";

export type QuickFindKind =
  | "student"
  | "family"
  | "college"
  | "conversation"
  | "document";

export interface QuickFindResult {
  id: string;
  label: string;
  sublabel: string | null;
  href: string;
  kind: QuickFindKind;
}

/**
 * Global quick-find (fix plan 8.4, expanded 11.3): jump to any student,
 * family, college, conversation, or document from anywhere in the staff
 * shell. Respects assignment scoping — a plain counselor only finds their
 * own clients and their documents/conversations, same as the list pages.
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
  const scopedSet = scopedIds === null ? null : new Set(scopedIds);

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

  // College catalog is global (not firm-scoped) — jump to any college page.
  const collegesQuery = db
    .from("colleges")
    .select("id, name, city, state_region")
    .ilike("name", like)
    .limit(5);

  let documentsQuery = db
    .from("documents")
    .select("id, title, students(first_name, last_name)")
    .eq("firm_id", ctx.firmId)
    .is("archived_at", null)
    .ilike("title", like)
    .limit(5);
  // Scoped counselors see only their assigned students' documents — mirrors
  // getDocuments (firm-level docs with no student stay owner/admin-only).
  if (scopedIds !== null) documentsQuery = documentsQuery.in("student_id", scopedIds);

  const [students, families, colleges, documents] = await Promise.all([
    studentsQuery,
    familiesQuery,
    collegesQuery,
    documentsQuery,
  ]);

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
  for (const c of colleges.data ?? []) {
    results.push({
      id: c.id,
      kind: "college",
      label: c.name,
      sublabel:
        [c.city, c.state_region].filter(Boolean).join(", ") || "College",
      href: `/college-planning/${c.id}`,
    });
  }

  // Conversations: reuse the matched students so a name jumps straight to the
  // thread. Deep-links via /messages?c=<id> (the inbox auto-opens it).
  const matchedStudentIds = (students.data ?? []).map((s) => s.id);
  if (matchedStudentIds.length > 0) {
    const { data: convos } = await db
      .from("conversations")
      .select("id, student_id, students(first_name, last_name)")
      .eq("firm_id", ctx.firmId)
      .in("student_id", matchedStudentIds)
      .order("updated_at", { ascending: false })
      .limit(3);
    for (const c of convos ?? []) {
      const student = (Array.isArray(c.students) ? c.students[0] : c.students) as
        | { first_name: string; last_name: string }
        | null;
      results.push({
        id: c.id,
        kind: "conversation",
        label: student
          ? `${student.first_name} ${student.last_name}`
          : "Conversation",
        sublabel: "Conversation",
        href: `/messages?c=${c.id}`,
      });
    }
  }

  for (const d of documents.data ?? []) {
    const student = (Array.isArray(d.students) ? d.students[0] : d.students) as
      | { first_name: string; last_name: string }
      | null;
    results.push({
      id: d.id,
      kind: "document",
      label: d.title,
      sublabel: student
        ? `${student.first_name} ${student.last_name}`
        : "Document",
      href: `/documents?search=${encodeURIComponent(d.title)}`,
    });
  }

  return { results };
}
