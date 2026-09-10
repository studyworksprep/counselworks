import {
  getTasks,
  getTasksNeedingReview,
  getRecurringTaskTemplates,
  getStudentsForSelect,
  getStaffForSelect,
} from "@/lib/db/queries";
import { normalizeTaskView } from "@/lib/constants/tasks";
import { TasksClient } from "./tasks-client";

interface Props {
  searchParams: Promise<{
    search?: string;
    status?: string;
    view?: string | string[];
    work?: string;
  }>;
}

export default async function TasksPage({ searchParams }: Props) {
  const params = await searchParams;
  const [tasks, recurring, students, staff, reviews] = await Promise.all([
    getTasks({
      search: params.search,
      status: params.status,
      view: normalizeTaskView(params.view),
      work: params.work === "workflow-week" ? params.work : undefined,
    }),
    getRecurringTaskTemplates(),
    getStudentsForSelect(),
    getStaffForSelect(),
    getTasksNeedingReview(),
  ]);

  return (
    <TasksClient
      reviewCount={reviews.length}
      tasks={tasks}
      recurring={recurring}
      todayIso={new Date().toISOString().slice(0, 10)}
      students={students}
      staff={staff}
    />
  );
}
