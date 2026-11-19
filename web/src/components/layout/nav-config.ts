import type { Permission } from "@/modules/permissions/types";
import type { IconName } from "@/components/ui/icon";

export interface NavItem {
  name: string;
  href: string;
  icon: IconName;
  permission?: Permission;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

export type ShellVariant = "staff" | "student" | "family";

/**
 * One config-driven navigation per shell (fix plan 9.6). The staff nav is
 * grouped (Clients / Admissions / Operations / Admin) so 14 flat items
 * become scannable.
 *
 * Each item names its area icon (components/ui/icon.tsx). The page header
 * looks the current path up here (areaIconForPath), so the icon a person
 * clicked in the sidebar is the icon that titles the page they land on.
 * Every destination has its own glyph: no two items share one.
 */
export const NAV: Record<ShellVariant, NavGroup[]> = {
  staff: [
    {
      label: null,
      items: [{ name: "Dashboard", href: "/dashboard", icon: "dashboard" }],
    },
    {
      label: "Clients",
      items: [
        { name: "Students", href: "/students", icon: "students", permission: "view_student" },
        { name: "Families", href: "/families", icon: "families", permission: "view_family" },
        // Prospects: offers sent before a family record exists. Same gate as
        // the pages themselves (proposalAccessAllowed → manage_clients).
        { name: "Proposals", href: "/proposals", icon: "proposals", permission: "manage_clients" },
      ],
    },
    {
      label: "Admissions",
      items: [
        { name: "Counselor caseload", href: "/caseload", icon: "caseload", permission: "view_student" },
        { name: "College Planning", href: "/college-planning", icon: "colleges" },
        { name: "Applications", href: "/applications", icon: "applications" },
        { name: "Essays", href: "/essays", icon: "essays" },
        { name: "Workflows", href: "/workflows", icon: "workflows", permission: "view_student" },
      ],
    },
    {
      label: "Operations",
      items: [
        { name: "Tasks", href: "/tasks", icon: "tasks", permission: "view_task" },
        { name: "Messages", href: "/messages", icon: "messages", permission: "view_message" },
        { name: "Documents", href: "/documents", icon: "documents", permission: "view_document" },
        { name: "Calendar", href: "/calendar", icon: "calendar" },
        { name: "My settings", href: "/settings#personal-settings", icon: "settings" },
        { name: "Reports", href: "/reports", icon: "reports", permission: "view_reports" },
      ],
    },
    {
      label: "Admin",
      items: [
        { name: "Catalog review", href: "/colleges/discrepancies", icon: "catalog", permission: "manage_firm" },
        { name: "Firm settings", href: "/settings#firm-settings", icon: "firm", permission: "manage_firm" },
      ],
    },
  ],
  student: [
    {
      label: null,
      items: [
        { name: "My Dashboard", href: "/student-dashboard", icon: "dashboard" },
        { name: "My Profile", href: "/student-profile", icon: "profile" },
        { name: "My Interview & Stories", href: "/student-interview", icon: "interview" },
        { name: "College List", href: "/student-colleges", icon: "colleges" },
        { name: "My Tasks", href: "/student-tasks", icon: "tasks" },
        { name: "My Workflows", href: "/student-workflows", icon: "workflows" },
        { name: "My Applications", href: "/student-applications", icon: "applications" },
        { name: "Application readiness", href: "/student-readiness", icon: "readiness" },
        { name: "My Essays", href: "/student-essays", icon: "essays" },
        { name: "My Documents", href: "/student-documents", icon: "documents" },
        { name: "Messages", href: "/student-messages", icon: "messages" },
        { name: "My settings", href: "/student-settings", icon: "settings" },
      ],
    },
  ],
  family: [
    {
      label: null,
      items: [
        { name: "Family Dashboard", href: "/family-dashboard", icon: "dashboard" },
        { name: "Parent Interview", href: "/family-interview", icon: "interview" },
        { name: "College Lists", href: "/family-colleges", icon: "colleges" },
        { name: "Applications", href: "/family-applications", icon: "applications" },
        { name: "Application readiness", href: "/family-readiness", icon: "readiness" },
        { name: "Essay planning", href: "/family-essay-planning", icon: "essayPlanning" },
        { name: "Tasks", href: "/family-tasks", icon: "tasks" },
        { name: "Book a Meeting", href: "/family-booking", icon: "schedule" },
        { name: "Workflows", href: "/family-workflows", icon: "workflows" },
        { name: "Documents", href: "/family-documents", icon: "documents" },
        { name: "Messages", href: "/family-messages", icon: "messages" },
        { name: "Billing & agreements", href: "/family-billing", icon: "billing" },
        { name: "My settings", href: "/family-settings", icon: "settings" },
      ],
    },
  ],
};

/**
 * Pages that sit under an area without being a sidebar item themselves.
 * More specific prefixes win over sidebar hrefs (longest match).
 */
const EXTRA_AREAS: { href: string; icon: IconName }[] = [
  { href: "/colleges", icon: "colleges" },
  { href: "/student-essays/planning", icon: "essayPlanning" },
  { href: "/family-essays", icon: "essays" },
  { href: "/family-agreements", icon: "billing" },
];

const AREA_PREFIXES: { href: string; icon: IconName }[] = [
  ...Object.values(NAV).flatMap((groups) =>
    groups.flatMap((g) => g.items.map((i) => ({ href: i.href.split("#")[0], icon: i.icon })))
  ),
  ...EXTRA_AREAS,
]
  // Longest prefix first, so /colleges/discrepancies beats /colleges.
  .sort((a, b) => b.href.length - a.href.length);

/** The area icon for a path, or null outside every area. */
export function areaIconForPath(pathname: string | null): IconName | null {
  if (!pathname) return null;
  const hit = AREA_PREFIXES.find(
    (a) => pathname === a.href || pathname.startsWith(a.href + "/")
  );
  return hit?.icon ?? null;
}
