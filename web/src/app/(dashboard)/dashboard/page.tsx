import { PageShell } from "@/components/layout/page-shell";
import { StatCard } from "@/components/cards/stat-card";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <PageShell
      title="Dashboard"
      description="Overview of your counseling firm"
    >
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Active Students" value={0} subtitle="Across all counselors" />
        <StatCard title="Upcoming Deadlines" value={0} subtitle="Next 30 days" />
        <StatCard title="Overdue Tasks" value={0} subtitle="Requires attention" />
        <StatCard title="Applications" value={0} subtitle="In progress" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">
              Recent Activity
            </h2>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              No recent activity. Activity will appear here as you start managing students and applications.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">
              Upcoming Meetings
            </h2>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              No upcoming meetings scheduled.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">
              Students by Counselor
            </h2>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              Add counselors and assign students to see caseload distribution.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">
              Application Status
            </h2>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              Application stage breakdown will appear once students begin applying.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
