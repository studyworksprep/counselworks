import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ReportsPage() {
  return (
    <PageShell
      title="Reports"
      description="Firm analytics and reporting"
      actions={<Button variant="outline">Export Data</Button>}
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Caseload Summary</h3>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              Students per counselor breakdown will appear once data is available.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Deadline Tracker</h3>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              Upcoming and past deadline statistics will be displayed here.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">
              Application Completion
            </h3>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              Application completion rates across students will be tracked here.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Decision Outcomes</h3>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              Acceptance, rejection, and waitlist rates will be shown here.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Task Completion</h3>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              Task completion and overdue metrics will appear here.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">
              Communication Activity
            </h3>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">
              Message and engagement statistics will be tracked here.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
