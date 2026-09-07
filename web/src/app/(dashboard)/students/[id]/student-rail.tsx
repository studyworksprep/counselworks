"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { StudentRailEntry } from "@/lib/db/queries";
import { STUDENT_STATUS_LABELS } from "@/lib/constants/students";

/**
 * Class-year-grouped student switcher beside the student workspace (fix
 * plan 13.0): "next student" becomes one click instead of a round trip
 * through the roster. Plain <details> groups — the current student's year
 * opens by default, the rest collapse — so it needs no client state and
 * stays keyboard-accessible. Hidden below the xl breakpoint, where the
 * roster page is the switcher. Switching keeps the current sub-page
 * (Essays → the next student's Essays).
 */
export function StudentRail({
  students,
  currentId,
}: {
  students: StudentRailEntry[];
  currentId: string;
}) {
  const pathname = usePathname();
  const base = `/students/${currentId}`;
  const section = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const byYear = new Map<number, StudentRailEntry[]>();
  for (const s of students) {
    const list = byYear.get(s.graduation_year) ?? [];
    list.push(s);
    byYear.set(s.graduation_year, list);
  }
  const currentYear = students.find((s) => s.id === currentId)?.graduation_year;
  const years = Array.from(byYear.keys()).sort((a, b) => a - b);

  return (
    <aside
      aria-label="Students"
      className="hidden w-56 shrink-0 border-r border-gray-200 bg-white xl:block"
    >
      <div className="sticky top-0 max-h-screen overflow-y-auto py-4">
        <div className="mb-2 flex items-center justify-between px-4">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Students
          </span>
          <Link
            href="/students"
            className="text-xs text-primary-600 hover:text-primary-700"
          >
            All
          </Link>
        </div>
        {years.map((year) => (
          <details
            key={year}
            open={year === currentYear}
            className="group border-t border-gray-100"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <span>Class of {year}</span>
              <span className="text-xs text-gray-400">
                {byYear.get(year)!.length}
              </span>
            </summary>
            <ul className="pb-2">
              {byYear.get(year)!.map((s) => {
                const active = s.id === currentId;
                return (
                  <li key={s.id}>
                    <Link
                      href={`/students/${s.id}${section}`}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center justify-between px-4 py-1.5 text-sm",
                        active
                          ? "bg-primary-50 font-medium text-primary-700"
                          : "text-gray-700 hover:bg-gray-50"
                      )}
                    >
                      <span className="truncate">
                        {s.first_name} {s.last_name}
                      </span>
                      {s.status !== "active" && (
                        <span className="ml-2 shrink-0 text-[10px] uppercase text-gray-400">
                          {STUDENT_STATUS_LABELS[s.status] ?? s.status}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </div>
    </aside>
  );
}
