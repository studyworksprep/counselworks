import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

export default function CalendarPage() {
  return (
    <PageShell
      title="Calendar"
      description="View meetings, deadlines, and important dates"
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">Calendar</h2>
            </CardHeader>
            <CardContent className="min-h-[500px]">
              <p className="text-sm text-gray-500">
                Calendar view will be implemented here. Upcoming meetings, deadlines, and events will be displayed.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-gray-900">Upcoming</h2>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">No upcoming events.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-semibold text-gray-900">
                Application Deadlines
              </h2>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">No deadlines tracked yet.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
