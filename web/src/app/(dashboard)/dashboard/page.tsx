import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { StatCard } from "@/components/cards/stat-card";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import Link from "next/link";
import {
  getRecentActivity,
  getUpcomingMeetingsForUser,
  getTodayAgenda,
} from "@/lib/db/queries";
import { resolveUserAndFirm, isFirmWideRole } from "@/lib/auth/resolve";
import { getDb } from "@/lib/db/client";
import {
  getCounselorDashboardStats,
  getFirmDashboardStats,
} from "@/modules/reports/service";
import { formatDateTime } from "@/lib/utils";

/** Recent Activity rows deep-link to their entities (fix plan 8.2). */
function activityHref(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case "student":
      return `/students/${entityId}`;
    case "application":
      return `/applications/${entityId}`;
    case "document":
      return "/documents";
    case "meeting":
      return "/calendar";
    case "student_invitation":
    case "family_invitation":
      return "/families";
    case "student_workflow":
      return "/workflows";
    default:
      return null;
  }
}

export default async function DashboardPage() {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return redirect("/sign-in");

  const db = getDb();
  const firmWide = isFirmWideRole(ctx.role);

  const [stats, activity, meetings, agenda] = await Promise.all([
    firmWide
      ? getFirmDashboardStats(db, ctx.firmId)
      : getCounselorDashboardStats(db, ctx.firmId, ctx.dbUserId),
    getRecentActivity(),
    getUpcomingMeetingsForUser(),
    getTodayAgenda(),
  ]);

  return (
    <PageShell title="Dashboard" description="Overview of your counseling firm">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {firmWide ? (
          <FirmStatCards stats={stats as Awaited<ReturnType<typeof getFirmDashboardStats>>} />
        ) : (
          <CounselorStatCards
            stats={stats as Awaited<ReturnType<typeof getCounselorDashboardStats>>}
          />
        )}
      </div>

      {/* Today agenda (fix plan 8.3): the morning screen — every item links
          to where the work happens. */}
      <Card className="mt-8">
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Today</h2>
        </CardHeader>
        <CardContent>
          {agenda.length === 0 ? (
            <p className="text-sm text-gray-500">
              Nothing due today — no overdue tasks, meetings, or deadlines
              inside a week.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {agenda.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 py-2.5 hover:bg-gray-50"
                  >
                    <span
                      className={
                        item.kind === "meeting"
                          ? "inline-flex w-20 justify-center rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700"
                          : item.overdue
                            ? "inline-flex w-20 justify-center rounded-full bg-danger-50 px-2 py-0.5 text-xs font-medium text-danger-700"
                            : "inline-flex w-20 justify-center rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-700"
                      }
                    >
                      {item.kind === "meeting"
                        ? "Meeting"
                        : item.kind === "deadline"
                          ? "Deadline"
                          : item.overdue
                            ? "Overdue"
                            : "Due"}
                    </span>
                    <span className="flex-1 text-sm text-gray-900">
                      {item.title}
                      {item.subtitle && (
                        <span className="text-gray-400"> · {item.subtitle}</span>
                      )}
                    </span>
                    {item.at && (
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {formatDateTime(item.at)}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-gray-500">
                No recent activity. Activity will appear here as you start managing
                students and applications.
              </p>
            ) : (
              <ul className="space-y-3">
                {activity.map((event) => {
                  const label = ((event.metadata_json as {
                    label?: string;
                  } | null)?.label as string) ?? null;
                  const href = activityHref(event.entity_type, event.entity_id);
                  const body = label ?? (
                    <>
                      <span className="font-medium capitalize">
                        {event.action_type.replace(/_/g, " ")}
                      </span>{" "}
                      <span className="text-gray-500">{event.entity_type}</span>
                    </>
                  );
                  return (
                    <li
                      key={event.id}
                      className="flex items-start justify-between border-b border-gray-100 pb-3 last:border-0"
                    >
                      <div>
                        {href ? (
                          <Link
                            href={href}
                            className="text-sm text-gray-900 hover:text-primary-600"
                          >
                            {body}
                          </Link>
                        ) : (
                          <p className="text-sm text-gray-900">{body}</p>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap ml-4">
                        {formatDateTime(event.created_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          {firmWide &&
            (() => {
              const caseload = (
                stats as Awaited<ReturnType<typeof getFirmDashboardStats>>
              ).students_by_counselor;
              if (!caseload || caseload.length === 0) return null;
              return (
                <>
                  <CardHeader>
                    <h2 className="text-lg font-semibold text-gray-900">
                      Caseload by Counselor
                    </h2>
                  </CardHeader>
                  <CardContent>
                    <ul className="mb-4 space-y-2">
                      {caseload.map((c) => (
                        <li
                          key={c.counselor_name}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-gray-700">
                            {c.counselor_name}
                          </span>
                          <span className="font-medium text-gray-900">
                            {c.count}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </>
              );
            })()}
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Upcoming Meetings</h2>
          </CardHeader>
          <CardContent>
            {meetings.length === 0 ? (
              <p className="text-sm text-gray-500">No upcoming meetings scheduled.</p>
            ) : (
              <ul className="space-y-3">
                {meetings.map(
                  (meeting: {
                    id: string;
                    title: string;
                    scheduled_start_at: string;
                  }) => (
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
                  ),
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function FirmStatCards({
  stats,
}: {
  stats: Awaited<ReturnType<typeof getFirmDashboardStats>>;
}) {
  return (
    <>
      <StatCard
        title="Active Students"
        value={stats.active_students}
        subtitle="Across all counselors"
        href="/students?status=active"
      />
      <StatCard
        title="Upcoming Deadlines"
        value={stats.upcoming_deadlines}
        subtitle="Tasks + applications, 30 days"
        href="/applications?due=soon"
      />
      <StatCard
        title="Overdue Tasks"
        value={stats.overdue_tasks}
        subtitle="Requires attention"
        href="/tasks?status=pending"
      />
      <StatCard
        title="Active Workflows"
        value={stats.active_workflows}
        href="/workflows"
        subtitle={
          stats.stalled_workflows > 0
            ? `${stats.stalled_workflows} past due`
            : "On track"
        }
      />
    </>
  );
}

function CounselorStatCards({
  stats,
}: {
  stats: Awaited<ReturnType<typeof getCounselorDashboardStats>>;
}) {
  return (
    <>
      <StatCard
        title="My Students"
        value={stats.my_students}
        subtitle="Assigned to me"
        href="/students"
      />
      <StatCard
        title="Due Today"
        value={stats.due_today}
        subtitle="Tasks on my plate"
        href="/tasks"
      />
      <StatCard
        title="Overdue"
        value={stats.overdue}
        subtitle="Behind on my tasks"
        href="/tasks"
      />
      <StatCard
        title="Workflow Steps This Week"
        value={stats.workflow_steps_due_this_week}
        subtitle="Next 7 days"
        href="/workflows"
      />
    </>
  );
}
