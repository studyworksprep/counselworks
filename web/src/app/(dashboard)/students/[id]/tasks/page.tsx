import { notFound } from "next/navigation";
import {
  getTasks,
  getStudentByIdCached,
  getStaffForSelect,
} from "@/lib/db/queries";
import { TasksClient } from "@/app/(dashboard)/tasks/tasks-client";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ search?: string; status?: string }>;
}

/**
 * Student Tasks (fix plan 13.0): the firm-wide Tasks list pinned to this
 * student — every open and completed task for them across staff, with
 * new tasks defaulting to the student.
 */
export default async function StudentTasksPage({ params, searchParams }: Props) {
  const [{ id }, filters] = await Promise.all([params, searchParams]);
  const [student, tasks, staff] = await Promise.all([
    getStudentByIdCached(id),
    getTasks({ search: filters.search, status: filters.status, studentId: id }),
    getStaffForSelect(),
  ]);
  if (!student) return notFound();

  return (
    <TasksClient
      tasks={tasks}
      students={[{ id, name: `${student.first_name} ${student.last_name}` }]}
      staff={staff}
      embed={{ studentId: id, basePath: `/students/${id}/tasks` }}
    />
  );
}
