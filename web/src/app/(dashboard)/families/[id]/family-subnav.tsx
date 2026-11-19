"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

/**
 * Family workspace sub-navigation (fix plan 13.0). Real routes, not tabs
 * in client state: deep links land on the right area, back/forward work,
 * and each area is its own server component.
 */
export const FAMILY_SECTIONS = [
  { key: "overview", icon: "dashboard", label: "Overview", path: "" },
  { key: "billing", icon: "billing", label: "Billing", path: "/billing" },
  { key: "tasks", icon: "tasks", label: "Tasks", path: "/tasks" },
  { key: "documents", icon: "documents", label: "Documents", path: "/documents" },
  { key: "meetings", icon: "calendar", label: "Meetings", path: "/meetings" },
] as const;

export function FamilySubnav({ familyId }: { familyId: string }) {
  const pathname = usePathname();
  const base = `/families/${familyId}`;
  const current =
    [...FAMILY_SECTIONS]
      .filter((s) => s.path !== "")
      .find((s) => pathname.startsWith(`${base}${s.path}`))?.key ?? "overview";

  return (
    <nav
      aria-label="Family sections"
      className="border-b border-gray-200 bg-white px-4 sm:px-8"
    >
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {FAMILY_SECTIONS.map((s) => {
          const active = s.key === current;
          return (
            <li key={s.key}>
              <Link
                href={`${base}${s.path}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                  active
                    ? "border-primary-600 text-primary-700"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                )}
              >
                <Icon
                  name={s.icon}
                  className={cn("h-4 w-4", active ? "text-primary-600" : "text-gray-500")}
                />
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
