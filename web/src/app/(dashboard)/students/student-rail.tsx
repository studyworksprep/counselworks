"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { StudentRailEntry } from "@/lib/db/queries";
import { STUDENT_STATUS_LABELS } from "@/lib/constants/students";
import { STUDENT_RAIL_COOKIE, persistCollapsed } from "@/lib/ui/layout-prefs";

const STUDENT_PATH = /^\/students\/([0-9a-f-]{36})(\/.*)?$/;

/**
 * Class-year-grouped student rail (fix plan 13.0): search, Add student, and
 * one-click switching between students that keeps the current sub-page
 * (Essays → the next student's Essays). Plain <details> groups — the
 * current student's year opens by default — so it stays keyboard
 * accessible with no extra state.
 *
 * Collapsed, it renders no names at all (not merely hidden): a counselor
 * sharing their screen can hide the rest of the roster with one click, and
 * the choice is remembered per browser via a cookie so the next page paints
 * collapsed too. Hidden below lg, where the roster page is the switcher.
 */
export function StudentRail({
  students,
  canCreate,
  initialCollapsed,
}: {
  students: StudentRailEntry[];
  canCreate: boolean;
  initialCollapsed: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [query, setQuery] = useState("");

  const match = STUDENT_PATH.exec(pathname);
  const currentId = match?.[1] ?? null;
  const section = match?.[2] ?? "";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q)
    );
  }, [students, query]);

  const byYear = new Map<number, StudentRailEntry[]>();
  for (const s of filtered) {
    const list = byYear.get(s.graduation_year) ?? [];
    list.push(s);
    byYear.set(s.graduation_year, list);
  }
  const currentYear = students.find((s) => s.id === currentId)?.graduation_year;
  const years = Array.from(byYear.keys()).sort((a, b) => a - b);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    persistCollapsed(STUDENT_RAIL_COOKIE, next);
  }

  if (collapsed) {
    return (
      <aside
        aria-label="Students"
        className="hidden w-10 shrink-0 border-r border-gray-200 bg-slate-100 lg:block"
      >
        <div className="sticky top-0 flex flex-col items-center gap-2 py-3">
          <button
            type="button"
            onClick={toggle}
            aria-label="Show students"
            aria-expanded={false}
            title="Show students"
            className="rounded-md p-1.5 text-gray-500 hover:bg-slate-200 hover:text-gray-700"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Students"
      className="hidden w-60 shrink-0 border-r border-gray-200 bg-slate-50 lg:block"
    >
      <div className="sticky top-0 flex max-h-screen flex-col">
        <div className="flex items-center justify-between px-3 pt-3">
          <span className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Students
          </span>
          <div className="flex items-center gap-1">
            <Link
              href="/students"
              className="rounded-md px-1.5 py-1 text-xs text-primary-600 hover:bg-slate-200 hover:text-primary-700"
            >
              Roster
            </Link>
            <button
              type="button"
              onClick={toggle}
              aria-label="Hide students"
              aria-expanded={true}
              title="Hide students (e.g. while sharing your screen)"
              className="rounded-md p-1 text-gray-500 hover:bg-slate-200 hover:text-gray-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
          </div>
        </div>
        <div className="space-y-2 px-3 py-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search students…"
            aria-label="Search students"
            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm placeholder:text-gray-400 focus:border-primary-400 focus:outline-none"
          />
          {canCreate && (
            <Link
              href="/students/new"
              className="block rounded-md border border-dashed border-gray-300 bg-white px-2 py-1.5 text-center text-xs font-medium text-gray-600 hover:border-primary-400 hover:text-primary-700"
            >
              + Add student
            </Link>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          {years.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-500">
              {students.length === 0 ? "No students yet." : "No matches."}
            </p>
          )}
          {years.map((year) => (
            <details
              key={year}
              open={year === currentYear || query.trim() !== "" || years.length === 1}
              className="group border-t border-gray-200"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between bg-slate-200/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-800 hover:bg-slate-200">
                <span className="flex items-center gap-1.5">
                  <svg
                    className="h-3 w-3 text-gray-500 transition-transform group-open:rotate-90"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                  Class of {year}
                </span>
                <span className="text-[10px] font-semibold text-gray-500">{byYear.get(year)!.length}</span>
              </summary>
              <ul className="py-1">
                {byYear.get(year)!.map((s) => {
                  const active = s.id === currentId;
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/students/${s.id}${section}`}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center justify-between py-1.5 pl-8 pr-3 text-sm",
                          active
                            ? "bg-primary-50 font-medium text-primary-700"
                            : "text-gray-700 hover:bg-slate-100"
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
      </div>
    </aside>
  );
}
