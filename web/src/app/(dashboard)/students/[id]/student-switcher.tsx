"use client";

import { usePathname } from "next/navigation";
import { EntitySwitcher } from "@/components/layout/entity-switcher";
import type { StudentRailEntry } from "@/lib/db/queries";
import { groupStudentsByYear } from "@/lib/ui/rail-groups";

/** Narrow-screen student switcher in the workspace header (fix plan 13.0). */
export function StudentSwitcher({
  students,
  currentId,
}: {
  students: StudentRailEntry[];
  currentId: string;
}) {
  const pathname = usePathname();
  const base = `/students/${currentId}`;
  const section = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  return (
    <EntitySwitcher
      label="Switch student"
      groups={groupStudentsByYear(students)}
      currentId={currentId}
      hrefFor={(id) => `/students/${id}${section}`}
    />
  );
}
