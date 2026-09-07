"use client";

import { usePathname } from "next/navigation";
import { EntityRail } from "@/components/layout/entity-rail";
import type { StudentRailEntry } from "@/lib/db/queries";
import { STUDENT_RAIL_COOKIE } from "@/lib/ui/layout-prefs";
import { groupStudentsByYear } from "@/lib/ui/rail-groups";

const STUDENT_PATH = /^\/students\/([0-9a-f-]{36})(\/.*)?$/;

/**
 * Class-year-grouped student rail (fix plan 13.0): search, Add student, and
 * one-click switching between students that keeps the current sub-page
 * (Essays → the next student's Essays). Chrome and collapse behaviour live
 * in the shared EntityRail.
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
  const match = STUDENT_PATH.exec(pathname);
  const currentId = match?.[1] ?? null;
  const section = match?.[2] ?? "";

  return (
    <EntityRail
      label="Students"
      groups={groupStudentsByYear(students)}
      currentId={currentId}
      hrefFor={(id) => `/students/${id}${section}`}
      rosterHref="/students"
      createHref={canCreate ? "/students/new" : undefined}
      createLabel="Add student"
      searchPlaceholder="Search students…"
      emptyText="No students yet."
      cookieName={STUDENT_RAIL_COOKIE}
      initialCollapsed={initialCollapsed}
      icon={
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        </svg>
      }
    />
  );
}
