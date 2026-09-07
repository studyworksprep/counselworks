import { notFound } from "next/navigation";
import {
  getTasks,
  getFamilyByIdCached,
  getStaffForSelect,
} from "@/lib/db/queries";
import type { FamilyStudentSummary } from "@/lib/db/queries";
import { TasksClient } from "@/app/(dashboard)/tasks/tasks-client";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ search?: string; status?: string }>;
}

/**
 * Family Tasks (fix plan 13.0): the firm-wide Tasks list pinned to the
 * household's students, with new tasks limited to those students.
 */
export default async function FamilyTasksPage({ params, searchParams }: Props) {
  const [{ id }, filters] = await Promise.all([params, searchParams]);
  const [family, tasks, staff] = await Promise.all([
    getFamilyByIdCached(id),
    getTasks({ search: filters.search, status: filters.status, familyId: id }),
    getStaffForSelect(),
  ]);
  if (!family) return notFound();

  return (
    <TasksClient
      tasks={tasks}
      students={family.students.map((s: FamilyStudentSummary) => ({
        id: s.id,
        name: `${s.first_name} ${s.last_name}`,
      }))}
      staff={staff}
      embed={{ basePath: `/families/${id}/tasks` }}
    />
  );
}
