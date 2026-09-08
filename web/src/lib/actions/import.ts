"use server";

import { revalidatePath } from "next/cache";
import { createServerClient, getDb } from "../db/client";
import { resolveUserAndFirm, STAFF_ROLE_LIST } from "../auth/resolve";
import { requireClientIntake } from "../auth/authorize";
import { recordAuditEvent } from "../audit";
import { provisionStudent } from "../students/provision";
import {
  IMPORT_MAX_BYTES,
  nameKey,
  parseImportFile,
  type ImportRow,
} from "../import/csv";

/**
 * CSV bulk import of families/students (fix plan 13.4). Owner/admin only
 * (the 7.1 intake gate). Two entry points share one planner: preview
 * (dry run, no writes) and run (re-parses and re-plans the same file, then
 * writes). Idempotent: households match by name, students by household +
 * name + class year, parents by email, assignments by student + staff —
 * re-importing a file creates nothing.
 */

export type RowAction =
  | "create"
  | "existing"
  | "skip_existing"
  | "link_existing"
  | "skip_member"
  | "assign"
  | "skip_assigned"
  | "unknown";

export interface RowPlan {
  line: number;
  household: string;
  familyAction: "create" | "existing";
  student: string;
  studentAction: "create" | "skip_existing";
  parent: string | null;
  parentAction: "create" | "link_existing" | "skip_member" | null;
  counselor: string | null;
  counselorAction: "assign" | "skip_assigned" | "unknown" | null;
  errors: string[];
}

export interface ImportPlan {
  headerErrors: string[];
  unknownHeaders: string[];
  rows: RowPlan[];
  /** Counts of what an import would write. */
  toCreate: { families: number; students: number; parents: number; assignments: number };
  invalidRows: number;
}

export interface ImportResult {
  families: number;
  students: number;
  parents: number;
  assignments: number;
  skippedStudents: number;
}

async function readFile(formData: FormData): Promise<{ text: string } | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file" };
  if (file.size > IMPORT_MAX_BYTES) return { error: "The file is larger than 1 MB" };
  return { text: await file.text() };
}

interface Context {
  ctx: { firmId: string; dbUserId: string };
  familiesByKey: Map<string, string>; // nameKey(household) → family id
  studentsByKey: Set<string>; // nameKey(familyId, first, last, year)
  membersByFamily: Map<string, Set<string>>; // family id → member emails
  familiesWithPrimary: Set<string>;
  staffByEmail: Map<string, string>; // email → user id
  assignedByStudent: Map<string, Set<string>>; // student key → staff user ids
}

async function loadContext(ctx: { firmId: string; dbUserId: string }): Promise<Context> {
  const db = getDb();
  const [families, students, members, staff, assignments] = await Promise.all([
    db.from("families").select("id, household_name").eq("firm_id", ctx.firmId).is("archived_at", null),
    db
      .from("students")
      .select("id, family_id, first_name, last_name, graduation_year")
      .eq("firm_id", ctx.firmId),
    db
      .from("family_members")
      .select("family_id, is_primary_contact, users:user_id(email)")
      .eq("firm_id", ctx.firmId),
    db
      .from("firm_memberships")
      .select("user_id, role, users:user_id(email)")
      .eq("firm_id", ctx.firmId)
      .eq("status", "active")
      .in("role", STAFF_ROLE_LIST),
    db.from("student_staff_assignments").select("student_id, user_id").eq("firm_id", ctx.firmId),
  ]);

  const familiesByKey = new Map<string, string>();
  for (const f of families.data ?? []) familiesByKey.set(nameKey(f.household_name), f.id);

  const studentsByKey = new Set<string>();
  const studentIdByKey = new Map<string, string>();
  for (const s of students.data ?? []) {
    const key = nameKey(s.family_id, s.first_name, s.last_name, s.graduation_year);
    studentsByKey.add(key);
    studentIdByKey.set(s.id, key);
  }

  const membersByFamily = new Map<string, Set<string>>();
  const familiesWithPrimary = new Set<string>();
  for (const m of members.data ?? []) {
    const email = ((m as Record<string, unknown>).users as { email: string } | null)?.email;
    const set = membersByFamily.get(m.family_id) ?? new Set<string>();
    if (email) set.add(email.toLowerCase());
    membersByFamily.set(m.family_id, set);
    if (m.is_primary_contact) familiesWithPrimary.add(m.family_id);
  }

  const staffByEmail = new Map<string, string>();
  for (const s of staff.data ?? []) {
    const email = ((s as Record<string, unknown>).users as { email: string } | null)?.email;
    if (email) staffByEmail.set(email.toLowerCase(), s.user_id);
  }

  const assignedByStudent = new Map<string, Set<string>>();
  for (const a of assignments.data ?? []) {
    const key = studentIdByKey.get(a.student_id);
    if (!key) continue;
    const set = assignedByStudent.get(key) ?? new Set<string>();
    set.add(a.user_id);
    assignedByStudent.set(key, set);
  }

  return { ctx, familiesByKey, studentsByKey, membersByFamily, familiesWithPrimary, staffByEmail, assignedByStudent };
}

/** Pure planning over the loaded context; mutates in-file state so later rows see earlier ones. */
function planRows(rows: ImportRow[], c: Context): ImportPlan {
  const plannedFamilies = new Map<string, string>(); // key → placeholder id "new:<key>"
  const plannedStudents = new Set<string>();
  const plannedMembers = new Map<string, Set<string>>();
  const plannedPrimary = new Set<string>();
  const plannedAssignments = new Map<string, Set<string>>();
  const toCreate = { families: 0, students: 0, parents: 0, assignments: 0 };
  let invalidRows = 0;

  const plans: RowPlan[] = rows.map((r) => {
    const errors = [...r.errors];
    const familyKey = nameKey(r.household_name);
    let familyId = c.familiesByKey.get(familyKey) ?? plannedFamilies.get(familyKey) ?? null;
    let familyAction: RowPlan["familyAction"] = "existing";
    if (!familyId && !errors.length) {
      familyId = `new:${familyKey}`;
      plannedFamilies.set(familyKey, familyId);
      familyAction = "create";
      toCreate.families++;
    }

    const studentKey = nameKey(familyId ?? familyKey, r.student_first_name, r.student_last_name, r.graduation_year);
    let studentAction: RowPlan["studentAction"] = "create";
    if (c.studentsByKey.has(studentKey)) studentAction = "skip_existing";
    else if (plannedStudents.has(studentKey)) errors.push("Duplicate student row in this file");
    else if (!errors.length) {
      plannedStudents.add(studentKey);
      toCreate.students++;
    }

    let parentAction: RowPlan["parentAction"] = null;
    if (r.parent_email && familyId) {
      const existing = c.membersByFamily.get(familyId);
      const planned = plannedMembers.get(familyId) ?? new Set<string>();
      if (existing?.has(r.parent_email) || planned.has(r.parent_email)) {
        parentAction = "skip_member";
      } else {
        parentAction = "create"; // resolved to link_existing at run time if the user exists
        planned.add(r.parent_email);
        plannedMembers.set(familyId, planned);
        if (!errors.length) toCreate.parents++;
      }
    }

    let counselorAction: RowPlan["counselorAction"] = null;
    if (r.counselor_email) {
      const staffId = c.staffByEmail.get(r.counselor_email);
      if (!staffId) {
        counselorAction = "unknown";
        errors.push(`No active staff member with email ${r.counselor_email}`);
      } else {
        const assigned = c.assignedByStudent.get(studentKey);
        const planned = plannedAssignments.get(studentKey) ?? new Set<string>();
        if (assigned?.has(staffId) || planned.has(staffId)) {
          counselorAction = "skip_assigned";
        } else {
          counselorAction = "assign";
          planned.add(staffId);
          plannedAssignments.set(studentKey, planned);
          if (!errors.length) toCreate.assignments++;
        }
      }
    }
    if (familyAction === "create" && !c.familiesWithPrimary.has(familyId ?? "")) plannedPrimary.add(familyId ?? "");

    if (errors.length) invalidRows++;
    return {
      line: r.line,
      household: r.household_name,
      familyAction,
      student: `${r.student_first_name} ${r.student_last_name} (${r.graduation_year || "?"})`.trim(),
      studentAction,
      parent: r.parent_email ? `${r.parent_first_name} ${r.parent_last_name} <${r.parent_email}>` : null,
      parentAction,
      counselor: r.counselor_email,
      counselorAction,
      errors,
    };
  });

  return { headerErrors: [], unknownHeaders: [], rows: plans, toCreate, invalidRows };
}

async function authorize(): Promise<
  { error: string } | { ctx: { firmId: string; dbUserId: string } }
> {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireClientIntake(ctx);
  } catch {
    return { error: "Only owners and admins can import clients" };
  }
  return { ctx };
}

type Planned =
  | { error: string }
  | {
      ctx: { firmId: string; dbUserId: string };
      rows: ImportRow[];
      plan: ImportPlan;
      context: Context | null;
    };

async function parseAndPlan(formData: FormData): Promise<Planned> {
  const auth = await authorize();
  if ("error" in auth) return { error: auth.error };
  const file = await readFile(formData);
  if ("error" in file) return { error: file.error };
  const parsed = parseImportFile(file.text);
  if (parsed.headerErrors.length > 0) {
    return {
      ctx: auth.ctx,
      rows: [],
      plan: {
        headerErrors: parsed.headerErrors,
        unknownHeaders: parsed.unknownHeaders,
        rows: [],
        toCreate: { families: 0, students: 0, parents: 0, assignments: 0 },
        invalidRows: 0,
      },
      context: null,
    };
  }
  const context = await loadContext(auth.ctx);
  const plan = planRows(parsed.rows, context);
  plan.unknownHeaders = parsed.unknownHeaders;
  return { ctx: auth.ctx, rows: parsed.rows, plan, context };
}

/** Dry run: what the file would do. No writes. */
export async function previewClientImport(
  formData: FormData
): Promise<{ error: string } | { plan: ImportPlan }> {
  const result = await parseAndPlan(formData);
  if ("error" in result) return { error: result.error };
  return { plan: result.plan };
}

/** Execute the import. Refuses when any row is invalid — fix the file, re-preview. */
export async function runClientImport(
  formData: FormData
): Promise<{ error: string } | { result: ImportResult }> {
  const planned = await parseAndPlan(formData);
  if ("error" in planned) return { error: planned.error };
  const { ctx, rows, plan } = planned;
  if (plan.headerErrors.length > 0) return { error: plan.headerErrors[0] };
  if (plan.invalidRows > 0) {
    return { error: `${plan.invalidRows} row${plan.invalidRows === 1 ? "" : "s"} need fixing before import` };
  }
  if (rows.length === 0 || !planned.context) return { error: "The file has no data rows" };
  const c = planned.context;

  const db = getDb();
  // Service role (allowlisted, docs/SECURITY.md): only for the users table,
  // to look up or create the placeholder account for an imported parent —
  // the same "invited_" placeholder addFamilyMember creates, so the portal
  // invitation flow claims it later. Every other write is user-scoped.
  const identity = createServerClient();

  const result: ImportResult = { families: 0, students: 0, parents: 0, assignments: 0, skippedStudents: 0 };
  const familyIds = new Map(c.familiesByKey);
  const studentIdByKey = new Map<string, string>();

  for (const [i, r] of rows.entries()) {
    const rowPlan = plan.rows[i];
    const familyKey = nameKey(r.household_name);
    let familyId = familyIds.get(familyKey) ?? null;
    if (!familyId) {
      const { data, error } = await db
        .from("families")
        .insert({
          firm_id: ctx.firmId,
          household_name: r.household_name,
          city: r.city,
          state_region: r.state_region,
          postal_code: r.postal_code,
          address_line1: r.address_line1,
          created_by_user_id: ctx.dbUserId,
          updated_by_user_id: ctx.dbUserId,
        })
        .select("id")
        .single();
      if (error || !data) {
        console.error("Import: family insert failed", error);
        return { error: `Line ${r.line}: failed to create household "${r.household_name}"` };
      }
      familyId = data.id as string;
      familyIds.set(familyKey, familyId);
      result.families++;
    }

    const studentKey = nameKey(familyId, r.student_first_name, r.student_last_name, r.graduation_year);
    let studentId = studentIdByKey.get(studentKey) ?? null;
    if (rowPlan.studentAction === "create" && !studentId) {
      const created = await provisionStudent(db, ctx, {
        familyId,
        firstName: r.student_first_name,
        lastName: r.student_last_name,
        graduationYear: r.graduation_year,
        schoolName: r.school_name,
      });
      if ("error" in created) return { error: `Line ${r.line}: ${created.error}` };
      studentId = created.id;
      studentIdByKey.set(studentKey, studentId);
      result.students++;
    } else if (rowPlan.studentAction === "skip_existing") {
      result.skippedStudents++;
      if (!studentId) {
        const { data } = await db
          .from("students")
          .select("id")
          .eq("firm_id", ctx.firmId)
          .eq("family_id", familyId)
          .ilike("first_name", r.student_first_name)
          .ilike("last_name", r.student_last_name)
          .eq("graduation_year", r.graduation_year)
          .limit(1)
          .maybeSingle();
        studentId = data?.id ?? null;
        if (studentId) studentIdByKey.set(studentKey, studentId);
      }
    }

    if (rowPlan.parentAction === "create" && r.parent_email) {
      let { data: user } = await identity
        .from("users")
        .select("id")
        .eq("email", r.parent_email)
        .maybeSingle();
      if (!user) {
        const { data: created, error } = await identity
          .from("users")
          .insert({
            auth_provider_user_id: `invited_${crypto.randomUUID()}`,
            email: r.parent_email,
            first_name: r.parent_first_name,
            last_name: r.parent_last_name,
          })
          .select("id")
          .single();
        if (error || !created) {
          console.error("Import: parent user insert failed", error);
          return { error: `Line ${r.line}: failed to add parent ${r.parent_email}` };
        }
        user = created;
      }
      const makePrimary = !c.familiesWithPrimary.has(familyId);
      const { error } = await db.from("family_members").insert({
        firm_id: ctx.firmId,
        family_id: familyId,
        user_id: user.id,
        relationship_type: r.parent_relationship ?? "parent",
        is_primary_contact: makePrimary,
      });
      if (error) {
        console.error("Import: family member insert failed", error);
        return { error: `Line ${r.line}: failed to add parent ${r.parent_email}` };
      }
      if (makePrimary) c.familiesWithPrimary.add(familyId);
      result.parents++;
    }

    if (rowPlan.counselorAction === "assign" && r.counselor_email && studentId) {
      const staffId = c.staffByEmail.get(r.counselor_email)!;
      const hasAny = (c.assignedByStudent.get(studentKey)?.size ?? 0) > 0;
      const { error } = await db.from("student_staff_assignments").insert({
        firm_id: ctx.firmId,
        student_id: studentId,
        user_id: staffId,
        assignment_type: "counselor",
        is_primary: !hasAny,
      });
      if (error) {
        console.error("Import: assignment insert failed", error);
        return { error: `Line ${r.line}: failed to assign ${r.counselor_email}` };
      }
      const set = c.assignedByStudent.get(studentKey) ?? new Set<string>();
      set.add(staffId);
      c.assignedByStudent.set(studentKey, set);
      result.assignments++;
    }
  }

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "firm",
    entityId: ctx.firmId,
    actionType: "clients_imported",
    label: `Imported ${result.students} student${result.students === 1 ? "" : "s"} and ${result.families} household${result.families === 1 ? "" : "s"} from CSV`,
    metadata: { ...result, rows: rows.length },
  });

  revalidatePath("/students");
  revalidatePath("/families");
  revalidatePath("/dashboard");
  return { result };
}
