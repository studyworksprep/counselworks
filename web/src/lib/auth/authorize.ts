import type { SupabaseClient } from "@supabase/supabase-js";
import { isFirmWideRole, isStaffRole } from "./resolve";

/**
 * Centralized authorization (fix plan Phase 1.5).
 *
 * Every server action that reads or mutates a specific record by ID goes
 * through these helpers. Checking `firm_id` alone is NOT authorization —
 * these combine tenancy with role, staff assignment, participation, and
 * visibility_scope. The decision logic is pure (unit-tested in
 * tests/unit/authorize.test.ts); the async wrappers only fetch the facts.
 */

export interface ActorContext {
  dbUserId: string;
  firmId: string;
  role: string;
}

export class AuthorizationError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthorizationError";
  }
}

// ---------------------------------------------------------------------------
// Pure decision core
// ---------------------------------------------------------------------------

/** The actor's relationship to a student-linked record. */
export type StudentRelationship =
  | "firm_staff" // staff role with firm-wide access
  | "assigned_staff" // scoped staff assigned to this student (or firm-level record)
  | "unassigned_staff" // scoped staff NOT assigned to this student
  | "own_student" // the student the record belongs to
  | "family_parent" // parent/guardian in that student's family
  | "none";

const PORTAL_STUDENT_SCOPES = new Set(["student", "family", "firm"]);
const PORTAL_FAMILY_SCOPES = new Set(["family", "firm"]);

/**
 * May this relationship read a document with this visibility_scope?
 * Mirrors the portal list queries (students see student/family/firm,
 * parents see family/firm) so fetch-by-UUID can never exceed list access.
 */
export function documentReadAllowed(
  visibilityScope: string,
  relationship: StudentRelationship
): boolean {
  switch (relationship) {
    case "firm_staff":
    case "assigned_staff":
      return true;
    case "own_student":
      return PORTAL_STUDENT_SCOPES.has(visibilityScope);
    case "family_parent":
      return PORTAL_FAMILY_SCOPES.has(visibilityScope);
    default:
      return false;
  }
}

/**
 * May this actor mutate (complete/reopen) a task?
 * Staff: firm-wide roles always; scoped staff when assigned to the task's
 * student, or when they are the task's assignee or creator. Students: only
 * their own portal-visible tasks. Parents: read-only (today's product
 * design; Phase 3 revisits).
 */
export function taskMutationAllowed(input: {
  role: string;
  relationship: StudentRelationship;
  visibilityScope: string;
  isAssignee: boolean;
  isCreator: boolean;
}): boolean {
  if (isStaffRole(input.role)) {
    if (input.relationship === "firm_staff") return true;
    if (input.relationship === "assigned_staff") return true;
    return input.isAssignee || input.isCreator;
  }
  if (input.role === "student") {
    return (
      input.relationship === "own_student" &&
      PORTAL_STUDENT_SCOPES.has(input.visibilityScope)
    );
  }
  return false;
}

/**
 * May this actor read/post in a conversation? Staff see all firm
 * conversations (the inbox is firm-scoped by design until Phase 3);
 * portal roles must be participants.
 */
export function conversationAccessAllowed(
  role: string,
  isParticipant: boolean
): boolean {
  return isStaffRole(role) || isParticipant;
}

// ---------------------------------------------------------------------------
// Fact-fetching helpers
// ---------------------------------------------------------------------------

/** The students.id linked to this portal user, if any. */
async function getOwnStudentId(
  db: SupabaseClient,
  ctx: ActorContext
): Promise<string | null> {
  const { data } = await db
    .from("students")
    .select("id")
    .eq("firm_id", ctx.firmId)
    .eq("user_id", ctx.dbUserId)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** Student IDs of the families this parent belongs to. */
async function getFamilyStudentIds(
  db: SupabaseClient,
  ctx: ActorContext
): Promise<string[]> {
  const { data: memberships } = await db
    .from("family_members")
    .select("family_id")
    .eq("firm_id", ctx.firmId)
    .eq("user_id", ctx.dbUserId);
  const familyIds = (memberships ?? []).map((m) => m.family_id);
  if (familyIds.length === 0) return [];

  const { data: students } = await db
    .from("students")
    .select("id")
    .eq("firm_id", ctx.firmId)
    .in("family_id", familyIds);
  return (students ?? []).map((s) => s.id);
}

async function isAssignedToStudent(
  db: SupabaseClient,
  ctx: ActorContext,
  studentId: string
): Promise<boolean> {
  const { data } = await db
    .from("student_staff_assignments")
    .select("id")
    .eq("firm_id", ctx.firmId)
    .eq("student_id", studentId)
    .eq("user_id", ctx.dbUserId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * Resolve the actor's relationship to a record that may be linked to a
 * student. A null studentId means a firm-level record: all staff may act,
 * portal roles may not.
 */
export async function resolveStudentRelationship(
  db: SupabaseClient,
  ctx: ActorContext,
  studentId: string | null
): Promise<StudentRelationship> {
  if (isStaffRole(ctx.role)) {
    if (isFirmWideRole(ctx.role)) return "firm_staff";
    if (studentId === null) return "assigned_staff"; // firm-level record
    return (await isAssignedToStudent(db, ctx, studentId))
      ? "assigned_staff"
      : "unassigned_staff";
  }
  if (studentId === null) return "none";
  if (ctx.role === "student") {
    const ownId = await getOwnStudentId(db, ctx);
    return ownId === studentId ? "own_student" : "none";
  }
  if (ctx.role === "parent_guardian") {
    const ids = await getFamilyStudentIds(db, ctx);
    return ids.includes(studentId) ? "family_parent" : "none";
  }
  return "none";
}

// ---------------------------------------------------------------------------
// Guards used by server actions
// ---------------------------------------------------------------------------

export function requireStaff(ctx: ActorContext): void {
  if (!isStaffRole(ctx.role)) {
    throw new AuthorizationError("Staff access required");
  }
}

/**
 * Client intake — creating family/student records — is an owner/admin action
 * (fix plan 7.1, deliberate July 2026 decision). Staff assignment requires
 * seeing the full client roster and is owner/admin-only (`manage_staff`);
 * a scoped counselor who created a client could never assign it — the record
 * would vanish from their assignment-scoped roster immediately. Creation and
 * assignment therefore travel together as one owner/admin handoff, and
 * `manage_clients` covers managing/inviting already-assigned clients only.
 */
export function requireClientIntake(ctx: ActorContext): void {
  if (ctx.role !== "firm_owner" && ctx.role !== "firm_admin") {
    throw new AuthorizationError(
      "Only owners and admins can create families and students"
    );
  }
}

/**
 * Staff access to a family: firm-wide roles always; scoped staff when they
 * are assigned to at least one student in the family.
 */
export async function requireFamilyAccess(
  db: SupabaseClient,
  ctx: ActorContext,
  familyId: string
): Promise<void> {
  requireStaff(ctx);
  if (isFirmWideRole(ctx.role)) return;

  const { data: students } = await db
    .from("students")
    .select("id")
    .eq("firm_id", ctx.firmId)
    .eq("family_id", familyId);
  const studentIds = (students ?? []).map((s) => s.id);
  if (studentIds.length === 0) {
    throw new AuthorizationError("Family not found");
  }

  const { data: assignment } = await db
    .from("student_staff_assignments")
    .select("id")
    .eq("firm_id", ctx.firmId)
    .eq("user_id", ctx.dbUserId)
    .in("student_id", studentIds)
    .limit(1)
    .maybeSingle();
  if (!assignment) {
    throw new AuthorizationError("Family not found");
  }
}

/**
 * Staff access to a student: firm-wide roles always; scoped staff when
 * assigned. Used by client-management flows (invitations etc.).
 */
export async function requireStudentAccess(
  db: SupabaseClient,
  ctx: ActorContext,
  studentId: string
): Promise<void> {
  const relationship = await resolveStudentRelationship(db, ctx, studentId);
  if (relationship !== "firm_staff" && relationship !== "assigned_staff") {
    throw new AuthorizationError("Student not found");
  }
}

export interface AuthorizedDocument {
  id: string;
  storage_key: string;
  student_id: string | null;
  visibility_scope: string;
}

/**
 * Fetch a document and verify the actor may read it (tenancy + role +
 * visibility_scope). Closes the historical hole where any firm member could
 * download staff-only documents by UUID.
 */
export async function requireDocumentAccess(
  db: SupabaseClient,
  ctx: ActorContext,
  documentId: string
): Promise<AuthorizedDocument> {
  const { data: doc } = await db
    .from("documents")
    .select("id, storage_key, student_id, visibility_scope")
    .eq("id", documentId)
    .eq("firm_id", ctx.firmId)
    .is("archived_at", null)
    .maybeSingle();

  if (!doc) throw new AuthorizationError("Document not found");

  const relationship = await resolveStudentRelationship(
    db,
    ctx,
    doc.student_id
  );
  if (!documentReadAllowed(doc.visibility_scope, relationship)) {
    throw new AuthorizationError("Document not found");
  }
  return doc;
}

/**
 * Verify the actor may read/post in a conversation (tenancy + staff role or
 * participation). Closes the holes where sendMessage verified nothing and
 * message reads only checked the firm.
 */
export async function requireConversationAccess(
  db: SupabaseClient,
  ctx: ActorContext,
  conversationId: string
): Promise<void> {
  const { data: conv } = await db
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!conv) throw new AuthorizationError("Conversation not found");

  const { data: participant } = await db
    .from("conversation_participants")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("user_id", ctx.dbUserId)
    .limit(1)
    .maybeSingle();

  if (!conversationAccessAllowed(ctx.role, !!participant)) {
    throw new AuthorizationError("Conversation not found");
  }
}

/**
 * Fetch a task and verify the actor may mutate it. Closes the hole where any
 * firm member (including portal roles) could flip any task by UUID.
 */
export async function requireTaskMutation(
  db: SupabaseClient,
  ctx: ActorContext,
  taskId: string
): Promise<void> {
  const { data: task } = await db
    .from("tasks")
    .select(
      "id, student_id, visibility_scope, assigned_user_id, created_by_user_id"
    )
    .eq("id", taskId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!task) throw new AuthorizationError("Task not found");

  const relationship = await resolveStudentRelationship(
    db,
    ctx,
    task.student_id
  );
  const allowed = taskMutationAllowed({
    role: ctx.role,
    relationship,
    visibilityScope: task.visibility_scope,
    isAssignee: task.assigned_user_id === ctx.dbUserId,
    isCreator: task.created_by_user_id === ctx.dbUserId,
  });
  if (!allowed) throw new AuthorizationError("Task not found");
}
