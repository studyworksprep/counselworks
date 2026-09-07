"use client";

import { usePathname, useRouter } from "next/navigation";
import type { StudentRailEntry } from "@/lib/db/queries";

/**
 * Compact student switcher for screens too narrow for the rail (fix plan
 * 13.0): a class-year-grouped select in the workspace header. Switching
 * keeps the current sub-page, like the rail.
 */
export function StudentSwitcher({
  students,
  currentId,
}: {
  students: StudentRailEntry[];
  currentId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const base = `/students/${currentId}`;
  const section = pathname.startsWith(base) ? pathname.slice(base.length) : "";

  const byYear = new Map<number, StudentRailEntry[]>();
  for (const s of students) {
    const list = byYear.get(s.graduation_year) ?? [];
    list.push(s);
    byYear.set(s.graduation_year, list);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => a - b);

  return (
    <select
      aria-label="Switch student"
      value={currentId}
      onChange={(e) => router.push(`/students/${e.target.value}${section}`)}
      className="max-w-[12rem] rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 lg:hidden"
    >
      {years.map((year) => (
        <optgroup key={year} label={`Class of ${year}`}>
          {byYear.get(year)!.map((s) => (
            <option key={s.id} value={s.id}>
              {s.first_name} {s.last_name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
