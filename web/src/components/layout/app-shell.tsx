"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ROLE_PERMISSIONS } from "@/modules/permissions/service";
import type { Permission } from "@/modules/permissions/types";
import type { FirmBranding } from "@/lib/db/queries";
import { Wordmark } from "@/components/brand/wordmark";
import { QuickFind } from "./quick-find";
import * as Icons from "@/components/icons";

type IconName = keyof typeof Icons;

interface NavItem {
  name: string;
  href: string;
  icon: IconName;
  permission?: Permission;
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/**
 * One config-driven navigation per shell (fix plan 9.6). The staff nav is
 * grouped (Clients / Admissions / Operations / Admin) so 14 flat items
 * become scannable.
 */
const NAV: Record<"staff" | "student" | "family", NavGroup[]> = {
  staff: [
    {
      label: null,
      items: [{ name: "Dashboard", href: "/dashboard", icon: "DashboardIcon" }],
    },
    {
      label: "Clients",
      items: [
        { name: "Students", href: "/students", icon: "StudentsIcon", permission: "view_student" },
        { name: "Families", href: "/families", icon: "FamiliesIcon", permission: "view_family" },
      ],
    },
    {
      label: "Admissions",
      items: [
        { name: "College Planning", href: "/college-planning", icon: "CollegeIcon" },
        { name: "Applications", href: "/applications", icon: "ApplicationsIcon" },
        { name: "Essays", href: "/essays", icon: "EssaysIcon" },
        { name: "Workflows", href: "/workflows", icon: "WorkflowsIcon", permission: "manage_workflows" },
      ],
    },
    {
      label: "Operations",
      items: [
        { name: "Tasks", href: "/tasks", icon: "TasksIcon", permission: "view_task" },
        { name: "Messages", href: "/messages", icon: "MessagesIcon", permission: "view_message" },
        { name: "Documents", href: "/documents", icon: "DocumentsIcon", permission: "view_document" },
        { name: "Calendar", href: "/calendar", icon: "CalendarIcon" },
        { name: "Reports", href: "/reports", icon: "ReportsIcon", permission: "view_reports" },
      ],
    },
    {
      label: "Admin",
      items: [
        { name: "Catalog review", href: "/colleges/discrepancies", icon: "CollegeIcon", permission: "manage_firm" },
        { name: "Settings", href: "/settings", icon: "SettingsIcon", permission: "manage_firm" },
      ],
    },
  ],
  student: [
    {
      label: null,
      items: [
        { name: "My Dashboard", href: "/student-dashboard", icon: "DashboardIcon" },
        { name: "My Profile", href: "/student-profile", icon: "ProfileIcon" },
        { name: "College List", href: "/student-colleges", icon: "CollegeIcon" },
        { name: "My Tasks", href: "/student-tasks", icon: "TasksIcon" },
        { name: "My Workflows", href: "/student-workflows", icon: "WorkflowsIcon" },
        { name: "My Applications", href: "/student-applications", icon: "ApplicationsIcon" },
        { name: "My Essays", href: "/student-essays", icon: "EssaysIcon" },
        { name: "My Documents", href: "/student-documents", icon: "DocumentsIcon" },
        { name: "Messages", href: "/student-messages", icon: "MessagesIcon" },
      ],
    },
  ],
  family: [
    {
      label: null,
      items: [
        { name: "Family Dashboard", href: "/family-dashboard", icon: "DashboardIcon" },
        { name: "Students", href: "/family-colleges", icon: "CollegeIcon" },
        { name: "Applications", href: "/family-applications", icon: "ApplicationsIcon" },
        { name: "Tasks", href: "/family-tasks", icon: "TasksIcon" },
        { name: "Workflows", href: "/family-workflows", icon: "WorkflowsIcon" },
        { name: "Documents", href: "/family-documents", icon: "DocumentsIcon" },
        { name: "Messages", href: "/family-messages", icon: "MessagesIcon" },
      ],
    },
  ],
};

const HOME: Record<keyof typeof NAV, string> = {
  staff: "/dashboard",
  student: "/student-dashboard",
  family: "/family-dashboard",
};

/**
 * Responsive shell (fix plan 9.5): fixed sidebar on lg+, off-canvas drawer
 * with a hamburger top bar below that — parents open portal invites on
 * phones. Shared by all three route groups.
 */
export function AppShell({
  variant,
  role,
  unreadCount = 0,
  branding,
  children,
}: {
  variant: "staff" | "student" | "family";
  role?: string;
  unreadCount?: number;
  branding?: FirmBranding;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const perms = role ? (ROLE_PERMISSIONS[role] ?? []) : null;
  const groups = NAV[variant]
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          !item.permission || !perms || perms.includes(item.permission)
      ),
    }))
    .filter((group) => group.items.length > 0);

  const logo = branding?.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={branding.logoUrl}
      alt={branding.firmName ?? "Firm logo"}
      className="max-h-9 max-w-[13rem] rounded"
    />
  ) : (
    <Wordmark dark />
  );

  return (
    <div className="min-h-screen">
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 bg-sidebar-bg px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="rounded-md p-1.5 text-sidebar-text hover:bg-sidebar-hover"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <Link href={HOME[variant]}>{logo}</Link>
      </header>

      {/* Overlay (mobile drawer open) */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-sidebar-bg transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-16 items-center justify-between px-6">
          <Link href={HOME[variant]}>{logo}</Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="rounded-md p-1 text-sidebar-text hover:bg-sidebar-hover lg:hidden"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {variant === "staff" && <QuickFind />}

        <nav className="mt-2 space-y-4 overflow-y-auto px-3 pb-6">
          {groups.map((group, gi) => (
            <div key={group.label ?? gi}>
              {group.label && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-text/50">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = Icons[item.icon];
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-sidebar-active text-white"
                          : "text-sidebar-text hover:bg-sidebar-hover"
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="flex-1">{item.name}</span>
                      {item.name.includes("Messages") && unreadCount > 0 && (
                        <span
                          className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-danger-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                          aria-label={`${unreadCount} unread messages`}
                        >
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="pt-14 lg:ml-64 lg:pt-0">{children}</div>
    </div>
  );
}
