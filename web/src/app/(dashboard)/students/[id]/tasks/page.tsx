import { ApplyPlan } from "@/components/workflows/apply-plan";
import { notFound } from "next/navigation";
import {
  getTasks,
  getWorkflowTemplates,
  getRecurringTaskTemplates,
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
  const [student, tasks, recurring, staff, templates] = await Promise.all([
    getStudentByIdCached(id),
    getTasks({ search: filters.search, status: filters.status, studentId: id }),
    getRecurringTaskTemplates({ studentId: id }),
    getStaffForSelect(),
    getWorkflowTemplates(),
  ]);
  if (!student) return notFound();

  return (
    <><details className="mb-6 rounded border bg-white p-4"><summary className="cursor-pointer font-medium">Apply plan</summary><div className="mt-4"><ApplyPlan studentId={id} templates={templates.filter(t=>t.is_active && t.instantiation_scope !== "student_college")}/></div></details>
    <TasksClient
      tasks={tasks}
      recurring={recurring}
      todayIso={new Date().toISOString().slice(0, 10)}
      students={[{ id, name: `${student.first_name} ${student.last_name}` }]}
      staff={staff}
      embed={{ studentId: id, basePath: `/students/${id}/tasks` }}
    /></>
  );
}
