import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { StatCard } from "@/components/cards/stat-card";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getParentDashboardData,
  getPortalNotesForFamily,
  getFamilyIntakeData,
  getFamilyProgressData,
  getFamilyWorkflows,
} from "@/lib/db/queries";
import { FamilyIntakeCard } from "./family-intake-card";
import { formatDate, formatDateTime, isOverdue } from "@/lib/utils";

export default async function FamilyDashboardPage() {
  const [data, notes, intakeChildren, progress, familyWorkflows] =
    await Promise.all([
      getParentDashboardData(),
      getPortalNotesForFamily(),
      getFamilyIntakeData(),
      getFamilyProgressData(),
      getFamilyWorkflows(),
    ]);

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
                        {meeting.location_text && (
                          <> &middot; {meeting.location_text}</>
                        )}
                      </p>
                      {(meeting.meeting_attendees ?? []).length > 0 && (
                        <p className="text-xs text-gray-400">
                          With{" "}
                          {(
                            meeting.meeting_attendees as unknown as Array<{
                              users: { first_name: string; last_name: string };
                            }>
                          )
                            .map(
                              (a) =>
                                `${a.users.first_name} ${a.users.last_name}`
                            )
                            .join(", ")}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Progress by student: applications + roadmap at a glance */}
      {progress.some(
        (p) =>
          p.applications.length > 0 ||
          familyWorkflows.some((w) => w.student.id === p.student.id),
      ) && (
        <Card className="mt-8">
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Progress by Student</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {progress.map((child) => {
                const workflows =
                  familyWorkflows.find(
                    (w) => w.student.id === child.student.id,
                  )?.workflows ?? [];
                if (child.applications.length === 0 && workflows.length === 0)
                  return null;
                return (
                  <div key={child.student.id}>
                    <h4 className="mb-2 text-sm font-semibold text-gray-900">
                      {child.student.first_name} {child.student.last_name}
                    </h4>
                    {child.applications.length > 0 && (
                      <ul className="mb-3 divide-y divide-gray-50">
                        {child.applications.map((app) => (
                          <li
                            key={app.id as string}
                            className="flex flex-wrap items-center justify-between gap-2 py-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-gray-900">
                                {app.college_name as string}
                                <span className="ml-1.5 text-xs font-normal uppercase text-gray-400">
                                  {app.application_type as string}
                                </span>
                              </p>
                              {(app.deadline_at as string | null) &&
                                !(app.submitted_at as string | null) && (
                                  <p className="text-xs text-gray-500">
                                    Due {formatDate(app.deadline_at as string)}
                                  </p>
                                )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {(app.checklist_total as number) > 0 && (
                                <span className="text-xs text-gray-500">
                                  {app.checklist_done as number}/
                                  {app.checklist_total as number} requirements
                                </span>
                              )}
                              {(app.decision_result as string | null) ? (
                                <Badge
                                  variant={
                                    (app.decision_result as string) ===
                                    "accepted"
                                      ? "success"
                                      : (app.decision_result as string) ===
                                          "rejected"
                                        ? "danger"
                                        : "warning"
                                  }
                                >
                                  {app.decision_result as string}
                                </Badge>
                              ) : (
                                <Badge variant="primary">
                                  {(app.stage as string).replace(/_/g, " ")}
                                </Badge>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {workflows.map((wf) => {
                      const pct =
                        wf.total_steps > 0
                          ? Math.round(
                              (wf.completed_steps / wf.total_steps) * 100,
                            )
                          : 0;
                      return (
                        <div key={wf.id} className="mb-2">
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>{wf.name}</span>
                            <span>
                              {wf.completed_steps}/{wf.total_steps}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full rounded-full bg-primary-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <FamilyIntakeCard childProfiles={intakeChildren} />

      {/* Notes from the counselor (family-visible) */}
      {notes.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <h3 className="font-semibold text-gray-900">
              Notes from your counselor
            </h3>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {notes.map((note) => (
                <li
                  key={note.id}
                  className="border-b border-gray-100 pb-3 last:border-0"
                >
                  {note.title && (
                    <p className="text-sm font-medium text-gray-900">
                      {note.title}
                    </p>
                  )}
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {note.body}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {formatDate(note.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
