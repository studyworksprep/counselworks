/** Keep in sync with public.is_staff() in migration 00016. Client-safe. */
export const STAFF_ROLE_LIST = [
  "firm_owner", "firm_admin", "counselor", "essay_coach", "tutor", "read_only_staff",
] as const;
export type StaffRole = (typeof STAFF_ROLE_LIST)[number];
export function isStaffRole(role: string): role is StaffRole {
  return (STAFF_ROLE_LIST as readonly string[]).includes(role);
}
const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  firm_owner: "Owner", firm_admin: "Admin", counselor: "Counselor",
  essay_coach: "Essay Coach", tutor: "Tutor", read_only_staff: "Read-Only Staff",
};
export function staffRoleLabel(role: string): string {
  return isStaffRole(role) ? STAFF_ROLE_LABELS[role] : "Unknown role";
}
export function isActiveStaffMember(member: { role: string; status: string }): boolean {
  return member.status === "active" && isStaffRole(member.role);
}
