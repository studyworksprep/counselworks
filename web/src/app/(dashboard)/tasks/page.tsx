import { getTasks, getStudentsForSelect, getStaffForSelect } from "@/lib/db/queries";
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
  const [tasks, students, staff] = await Promise.all([
    getTasks({
      search: params.search,
      status: params.status,
      view: params.view,
    }),
    getStudentsForSelect(),
    getStaffForSelect(),
  ]);

  return (
    <TasksClient
      tasks={tasks}
      students={students}
      staff={staff}
    />
  );
}
