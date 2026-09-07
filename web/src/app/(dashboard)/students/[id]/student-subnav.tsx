"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Student workspace sub-navigation (fix plan 13.0). Real routes, not tabs
 * in client state: deep links land on the right area, back/forward work,
 * and each area is its own server component. Tasks, Documents, and
 * Meetings join in the second cut once their queries take a student
 * filter — no dead tabs until then.
 */
export const STUDENT_SECTIONS = [
  { key: "overview", label: "Overview", path: "" },
  { key: "profile", label: "Profile", path: "/profile" },
  { key: "colleges", label: "Colleges", path: "/colleges" },
  { key: "applications", label: "Applications", path: "/applications" },
  { key: "essays", label: "Essays", path: "/essays" },
  { key: "family", label: "Family & Billing", path: "/family" },
] as const;

export function StudentSubnav({ studentId }: { studentId: string }) {
  const pathname = usePathname();
  const base = `/students/${studentId}`;
  const current =
    [...STUDENT_SECTIONS]
      .filter((s) => s.path !== "")
      .find((s) => pathname.startsWith(`${base}${s.path}`))?.key ?? "overview";

  return (
    <nav
      aria-label="Student sections"
      className="border-b border-gray-200 bg-white px-4 sm:px-8"
    >
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {STUDENT_SECTIONS.map((s) => {
          const active = s.key === current;
          return (
            <li key={s.key}>
              <Link
                href={`${base}${s.path}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-block whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                  active
                    ? "border-primary-600 text-primary-700"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                )}
              >
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
