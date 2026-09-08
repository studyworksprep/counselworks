import {
  getTasks,
  getRecurringTaskTemplates,
  getStudentsForSelect,
  getStaffForSelect,
} from "@/lib/db/queries";
import { TasksClient } from "./tasks-client";

interface Props {
  searchParams: Promise<{
    search?: string;
    status?: string;
    view?: "my" | "team" | "student";
  }>;
}

export default async function TasksPage({ searchParams }: Props) {
  const params = await searchParams;
  const [tasks, recurring, students, staff] = await Promise.all([
    getTasks({
      search: params.search,
      status: params.status,
      view: params.view,
    }),
    getRecurringTaskTemplates(),
    getStudentsForSelect(),
    getStaffForSelect(),
  ]);

  return (
    <TasksClient
      tasks={tasks}
      recurring={recurring}
      todayIso={new Date().toISOString().slice(0, 10)}
      students={students}
      staff={staff}
    />
  );
}
