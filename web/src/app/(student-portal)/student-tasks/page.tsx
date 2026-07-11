import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getStudentTasks } from "@/lib/db/queries";
import { formatDate, isOverdue } from "@/lib/utils";
import { AddPersonalTaskForm, StudentTaskActions } from "./tasks-client";

export default async function StudentTasksPage() {
  const tasks = await getStudentTasks();

  if (!tasks) redirect("/sign-in");

  const pending = tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
  const completed = tasks.filter((t) => t.status === "completed");

  return (
    <PageShell title="My Tasks" description="Tasks assigned to you by your counselor">
      {/* Open tasks */}
      <Card>
        <CardContent>
          <div className="border-b border-gray-100 pb-4 mb-2">
            <AddPersonalTaskForm />
          </div>
          {pending.length === 0 ? (
            <p className="py-4 text-sm text-gray-500">
              No open tasks. You&apos;re all caught up!
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {pending.map((task) => {
                const overdue = task.due_at && isOverdue(task.due_at);
                return (
                  <li
                    key={task.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <StudentTaskActions taskId={task.id} status={task.status} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="text-xs text-gray-500 truncate">
                            {task.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                      <Badge
                        variant={
                          task.priority === "high" || task.priority === "urgent"
                            ? "danger"
                            : task.priority === "medium"
                              ? "warning"
                              : "default"
                        }
                      >
                        {task.priority}
                      </Badge>
                      {overdue && <Badge variant="danger">Overdue</Badge>}
                      {task.due_at && (
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {formatDate(task.due_at)}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Completed tasks */}
      {completed.length > 0 && (
        <Card className="mt-6">
          <CardContent>
            <h3 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Completed
            </h3>
            <ul className="divide-y divide-gray-100">
              {completed.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center justify-between py-3 opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-5 rounded border-2 border-success-500 bg-success-50 flex items-center justify-center">
                      <svg className="h-3 w-3 text-success-500" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                    <span className="text-sm text-gray-600 line-through">
                      {task.title}
                    </span>
                  </div>
                  {task.due_at && (
                    <span className="text-xs text-gray-400">
                      {formatDate(task.due_at)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
