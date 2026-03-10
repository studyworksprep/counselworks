export type Role =
  | 'firm_owner'
  | 'firm_admin'
  | 'counselor'
  | 'essay_coach'
  | 'tutor'
  | 'read_only_staff'
  | 'student'
  | 'parent_guardian';

export type Permission =
  | "view_student"
  | "edit_student"
  | "delete_student"
  | "view_family"
  | "edit_family"
  | "view_task"
  | "edit_task"
  | "create_task"
  | "view_note"
  | "create_note"
  | "edit_note"
  | "view_message"
  | "send_message"
  | "view_document"
  | "upload_document"
  | "manage_firm"
  | "manage_staff"
  | "manage_billing"
  | "view_reports"
  | "manage_workflows"
  | "view_all_students"
  | "impersonate";

export interface PermissionContext {
  userId: string;
  firmId: string;
  role: string;
  assignedStudentIds: string[];
}
