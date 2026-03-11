import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { StatCard } from "@/components/cards/stat-card";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getStudentPortalData } from "@/lib/db/queries";
import { formatDate, formatDateTime, isOverdue } from "@/lib/utils";

export default async function StudentDashboardPage() {
  const data = await getStudentPortalData();

  if (!data) {
    redirect("/sign-in");
  }

  const { student, tasks, overdueTasks, applications, upcomingMeetings } = data;

  const activeApplications = applications.filter(
    (a) => a.stage !== "decision_received" && a.stage !== "withdrawn"
  );

  return (
    <PageShell
      title={`Welcome, ${student.first_name}`}
      description={`${student.school_name ? student.school_name + " · " : ""}Class of ${student.graduation_year}`}
    >
      {/* Stats row */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Open Tasks"
          value={tasks.length}
          subtitle={
            overdueTasks > 0 ? `${overdueTasks} overdue` : "You're on track"
          }
        />
        <StatCard
          title="Applications"
          value={activeApplications.length}
          subtitle="In progress"
        />
        <StatCard
          title="Total Schools"
          value={applications.length}
          subtitle="On your list"
        />
        <StatCard
          title="Upcoming Meetings"
          value={upcomingMeetings.length}
          subtitle={
            upcomingMeetings[0]
              ? formatDate(upcomingMeetings[0].scheduled_start_at)
              : "None scheduled"
          }
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Tasks */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">
              My Tasks
            </h2>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <p className="text-sm text-gray-500">
                No open tasks right now. Check back later!
              </p>
            ) : (
              <ul className="space-y-3">
                {tasks.map((task) => {
                  const overdue = task.due_at && isOverdue(task.due_at);
                  return (
                    <li
                      key={task.id}
                      className="flex items-center justify-between border-b border-gray-100 pb-3 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-2 w-2 rounded-full ${
                            task.priority === "high"
                              ? "bg-danger-500"
                              : task.priority === "medium"
                                ? "bg-warning-500"
                                : "bg-gray-300"
                          }`}
                        />
                        <span className="text-sm text-gray-900">
                          {task.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {overdue && (
                          <Badge variant="danger">Overdue</Badge>
                        )}
                        {task.due_at && (
                          <span className="text-xs text-gray-500">
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

        {/* Upcoming meetings */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">
              Upcoming Meetings
            </h2>
          </CardHeader>
          <CardContent>
            {upcomingMeetings.length === 0 ? (
              <p className="text-sm text-gray-500">
                No upcoming meetings scheduled.
              </p>
            ) : (
              <ul className="space-y-3">
                {upcomingMeetings.map((meeting) => (
                  <li
                    key={meeting.id}
                    className="border-b border-gray-100 pb-3 last:border-0"
                  >
                    <p className="text-sm font-medium text-gray-900">
                      {meeting.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDateTime(meeting.scheduled_start_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Applications */}
      <Card className="mt-8">
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">
            My Applications
          </h2>
        </CardHeader>
        <CardContent>
          {applications.length === 0 ? (
            <p className="text-sm text-gray-500">
              No applications yet. Your counselor will help you build your list.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="pb-2 font-medium">School</th>
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Deadline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {applications.map((app) => (
                    <tr key={app.id}>
                      <td className="py-2.5 font-medium text-gray-900">
                        {(() => {
                          const c = app.college as
                            | { name: string }
                            | { name: string }[]
                            | null;
                          if (!c) return "Unknown";
                          if (Array.isArray(c)) return c[0]?.name ?? "Unknown";
                          return c.name;
                        })()}
                      </td>
                      <td className="py-2.5 capitalize text-gray-600">
                        {app.application_type.replace(/_/g, " ")}
                      </td>
                      <td className="py-2.5">
                        <Badge
                          variant={
                            app.stage === "submitted"
                              ? "success"
                              : app.stage === "decision_received"
                                ? "primary"
                                : "default"
                          }
                        >
                          {app.stage.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-gray-500">
                        {app.deadline_at
                          ? formatDate(app.deadline_at)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
