import { PageShell } from "@/components/layout/page-shell";
import { StatCard } from "@/components/cards/stat-card";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { getDashboardStats, getRecentActivity } from "@/lib/db/queries";
import { formatDateTime } from "@/lib/utils";

export default async function DashboardPage() {
  const [stats, activity] = await Promise.all([
    getDashboardStats(),
    getRecentActivity(),
  ]);

  return (
    <PageShell
      title="Dashboard"
      description="Overview of your counseling firm"
    >
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Active Students"
          value={stats?.activeStudents ?? 0}
          subtitle="Across all counselors"
        />
        <StatCard
          title="Upcoming Deadlines"
          value={stats?.upcomingDeadlines ?? 0}
          subtitle="Next 30 days"
        />
        <StatCard
          title="Overdue Tasks"
          value={stats?.overdueTasks ?? 0}
          subtitle="Requires attention"
        />
        <StatCard
          title="Applications"
          value={stats?.activeApplications ?? 0}
          subtitle="In progress"
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">
              Recent Activity
            </h2>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-gray-500">
                No recent activity. Activity will appear here as you start
                managing students and applications.
              </p>
            ) : (
              <ul className="space-y-3">
                {activity.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-start justify-between border-b border-gray-100 pb-3 last:border-0"
                  >
                    <div>
                      <p className="text-sm text-gray-900">
                        <span className="font-medium capitalize">
                          {event.action_type.replace(/_/g, " ")}
                        </span>{" "}
                        <span className="text-gray-500">
                          {event.entity_type}
                        </span>
                      </p>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap ml-4">
                      {formatDateTime(event.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">
              Upcoming Meetings
            </h2>
          </CardHeader>
          <CardContent>
            {!stats?.upcomingMeetings?.length ? (
              <p className="text-sm text-gray-500">
                No upcoming meetings scheduled.
              </p>
            ) : (
              <ul className="space-y-3">
                {stats.upcomingMeetings.map(
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
                  )
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
