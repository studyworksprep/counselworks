import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { StatCard } from "@/components/cards/stat-card";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getParentDashboardData } from "@/lib/db/queries";
import { formatDate, formatDateTime, isOverdue } from "@/lib/utils";

export default async function FamilyDashboardPage() {
  const data = await getParentDashboardData();

  if (!data) {
    redirect("/sign-in");
  }

  const { students, tasks, overdueTasks, applications, upcomingMeetings } =
    data;

  const activeApplications = applications.filter(
    (a) => a.stage !== "decision_received" && a.stage !== "withdrawn"
  );

  return (
    <PageShell
      title="Family Dashboard"
      description="Overview of your children's college counseling progress"
    >
      {/* Children overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {students.map((child) => (
          <Card key={child.id}>
            <CardContent>
              <h3 className="font-semibold text-gray-900">
                {child.first_name} {child.last_name}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {child.school_name ? `${child.school_name} · ` : ""}
                Class of {child.graduation_year}
              </p>
              <Badge
                variant={child.status === "active" ? "success" : "default"}
                className="mt-2"
              >
                {child.status}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stats row */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Open Tasks"
          value={tasks.length}
          subtitle={
            overdueTasks > 0 ? `${overdueTasks} overdue` : "All on track"
          }
        />
        <StatCard
          title="Active Applications"
          value={activeApplications.length}
          subtitle="In progress"
        />
        <StatCard
          title="Total Schools"
          value={applications.length}
          subtitle="Across all students"
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
              Open Tasks
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
                  const s = task.students as
                    | { first_name: string }
                    | { first_name: string }[]
                    | null;
                  const studentName = s
                    ? Array.isArray(s)
                      ? s[0]?.first_name
                      : s.first_name
                    : null;

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
                        <div>
                          <span className="text-sm text-gray-900">
                            {task.title}
                          </span>
                          {studentName && (
                            <span className="ml-2 text-xs text-gray-500">
                              ({studentName})
                            </span>
                          )}
                        </div>
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
                {upcomingMeetings.map((meeting) => {
                  const s = meeting.students as
                    | { first_name: string }
                    | { first_name: string }[]
                    | null;
                  const studentName = s
                    ? Array.isArray(s)
                      ? s[0]?.first_name
                      : s.first_name
                    : null;

                  return (
                    <li
                      key={meeting.id}
                      className="border-b border-gray-100 pb-3 last:border-0"
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {meeting.title}
                        {studentName && (
                          <span className="ml-2 text-xs font-normal text-gray-500">
                            ({studentName})
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatDateTime(meeting.scheduled_start_at)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
