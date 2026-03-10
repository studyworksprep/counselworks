import type { Permission, PermissionContext } from "./types";

// ---------------------------------------------------------------------------
// Role -> Permission mapping
// ---------------------------------------------------------------------------

const ALL_PERMISSIONS: Permission[] = [
  "view_student",
  "edit_student",
  "delete_student",
  "view_family",
  "edit_family",
  "view_task",
  "edit_task",
  "create_task",
  "view_note",
  "create_note",
  "edit_note",
  "view_message",
  "send_message",
  "view_document",
  "upload_document",
  "manage_firm",
  "manage_staff",
  "manage_billing",
  "view_reports",
  "manage_workflows",
  "view_all_students",
  "impersonate",
];

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  firm_owner: [...ALL_PERMISSIONS],

  firm_admin: ALL_PERMISSIONS.filter((p) => p !== "impersonate"),

  counselor: [
    "view_student",
    "edit_student",
    "view_family",
    "edit_family",
    "view_task",
    "edit_task",
    "create_task",
    "view_note",
    "create_note",
    "edit_note",
    "view_message",
    "send_message",
    "view_document",
    "upload_document",
    "view_reports",
  ],

  essay_coach: [
    "view_student",
    "view_note",
    "create_note",
    "edit_note",
    "view_document",
    "upload_document",
  ],

  tutor: ["view_student", "view_note", "create_note", "view_task"],

  read_only_staff: [
    "view_student",
    "view_family",
    "view_task",
    "view_note",
    "view_message",
    "view_document",
    "view_reports",
    "view_all_students",
  ],

  student: [
    "view_student",
    "view_task",
    "view_note",
    "view_message",
    "view_document",
  ],

  parent_guardian: [
    "view_student",
    "view_family",
    "view_task",
    "view_note",
    "view_message",
  ],
};

// ---------------------------------------------------------------------------
// Roles that have implicit access to all students in the firm
// ---------------------------------------------------------------------------

const FIRM_WIDE_ROLES = new Set([
  "firm_owner",
  "firm_admin",
  "read_only_staff",
]);

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a permission context grants a specific permission.
 */
export function hasPermission(
  context: PermissionContext,
  permission: Permission
): boolean {
  const perms = ROLE_PERMISSIONS[context.role];
  if (!perms) return false;
  return perms.includes(permission);
}

/**
 * Check whether the user can view a particular student.
 * Firm-wide roles can view any student; scoped roles must be assigned.
 */
export function canViewStudent(
  context: PermissionContext,
  studentId: string
): boolean {
  if (!hasPermission(context, "view_student")) return false;

  if (FIRM_WIDE_ROLES.has(context.role)) return true;
  if (hasPermission(context, "view_all_students")) return true;

  return context.assignedStudentIds.includes(studentId);
}

/**
 * Check whether the user can edit a particular student.
 * Firm-wide roles can edit any student; scoped roles must be assigned.
 */
export function canEditStudent(
  context: PermissionContext,
  studentId: string
): boolean {
  if (!hasPermission(context, "edit_student")) return false;

  if (FIRM_WIDE_ROLES.has(context.role)) return true;
  if (hasPermission(context, "view_all_students")) return true;

  return context.assignedStudentIds.includes(studentId);
}

/**
 * Check whether the user can view a record based on its visibility scope and
 * the user's relationship to the associated student / family.
 */
export function canViewRecord(
  context: PermissionContext,
  record: {
    visibility_scope: string;
    student_id?: string;
    family_id?: string;
  }
): boolean {
  // Firm-wide visibility: any firm member can see it
  if (record.visibility_scope === "firm") {
    return true;
  }

  // Counselor-scoped: must be staff with appropriate access
  if (record.visibility_scope === "counselor") {
    const staffRoles = new Set([
      "firm_owner",
      "firm_admin",
      "counselor",
      "essay_coach",
      "tutor",
      "read_only_staff",
    ]);
    if (!staffRoles.has(context.role)) return false;

    // If tied to a student, make sure user can view that student
    if (record.student_id) {
      return canViewStudent(context, record.student_id);
    }
    return true;
  }

  // Family-scoped: parents and the student themselves can see it, plus staff
  if (record.visibility_scope === "family") {
    if (
      context.role === "parent_guardian" ||
      context.role === "student"
    ) {
      if (record.student_id) {
        return context.assignedStudentIds.includes(record.student_id);
      }
      return true;
    }
    // Staff can also view family-visible records if they have access
    if (record.student_id) {
      return canViewStudent(context, record.student_id);
    }
    return hasPermission(context, "view_student");
  }

  // Student-scoped: only the student and assigned staff
  if (record.visibility_scope === "student") {
    if (record.student_id) {
      return canViewStudent(context, record.student_id);
    }
    return false;
  }

  // Private: only the record creator (handled by caller) or firm admins
  if (record.visibility_scope === "private") {
    return FIRM_WIDE_ROLES.has(context.role);
  }

  return false;
}

/**
 * Throw an error if the context does not have the required permission.
 */
export function requirePermission(
  context: PermissionContext,
  permission: Permission
): void {
  if (!hasPermission(context, permission)) {
    throw new Error(
      `Permission denied: role "${context.role}" does not have "${permission}" permission`
    );
  }
}

/**
 * Build a PermissionContext from its constituent parts.
 */
export function getPermissionContext(
  userId: string,
  firmId: string,
  role: string,
  assignedStudentIds: string[]
): PermissionContext {
  return { userId, firmId, role, assignedStudentIds };
}
