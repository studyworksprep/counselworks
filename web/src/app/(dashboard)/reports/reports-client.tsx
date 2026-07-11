"use client";

import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ReportData {
  studentsByStatus: Record<string, number>;
  applicationsByStage: Record<string, number>;
  decisionOutcomes: Record<string, number>;
  tasksByStatus: Record<string, number>;
  totalConversations: number;
  caseload: { name: string; count: number }[];
}

// ---------------------------------------------------------------------------
// Simple bar chart component
// ---------------------------------------------------------------------------
function BarChart({
  data,
  colorFn,
}: {
  data: Record<string, number>;
  colorFn?: (key: string) => string;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, v]) => v), 1);

  if (entries.length === 0) {
    return <p className="text-sm text-gray-400">No data yet</p>;
  }

  return (
    <div className="space-y-2">
      {entries.map(([label, value]) => (
        <div key={label}>
          <div className="flex items-center justify-between text-xs mb-0.5">
            <span className="text-gray-700 capitalize">
              {label.replace(/_/g, " ")}
            </span>
            <span className="font-medium text-gray-900">{value}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100">
            <div
              className={`h-2 rounded-full ${colorFn?.(label) ?? "bg-primary-500"}`}
              style={{ width: `${(value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------
function StatCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 px-4 py-3">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Color maps
// ---------------------------------------------------------------------------
// Matches the shared student status enum (src/lib/constants/students.ts).
const statusColors: Record<string, string> = {
  active: "bg-green-500",
  paused: "bg-yellow-500",
  graduated: "bg-purple-400",
  archived: "bg-gray-400",
};

// Matches the stages the kanban actually writes.
const stageColors: Record<string, string> = {
  not_started: "bg-gray-400",
  in_progress: "bg-blue-400",
  submitted: "bg-green-500",
  under_review: "bg-yellow-500",
  decision_received: "bg-purple-500",
  withdrawn: "bg-red-400",
};

const decisionColors: Record<string, string> = {
  accepted: "bg-green-500",
  rejected: "bg-red-500",
  waitlisted: "bg-yellow-500",
  deferred: "bg-orange-500",
};

const taskColors: Record<string, string> = {
  pending: "bg-yellow-500",
  in_progress: "bg-blue-500",
  completed: "bg-green-500",
  cancelled: "bg-gray-400",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function ReportsClient({ data }: { data: ReportData | null }) {
  if (!data) {
    return (
      <PageShell title="Reports" description="Firm analytics and reporting">
        <p className="text-gray-500">Unable to load report data.</p>
      </PageShell>
    );
  }

  const totalStudents = Object.values(data.studentsByStatus).reduce(
    (a, b) => a + b,
    0
  );
  const totalApps = Object.values(data.applicationsByStage).reduce(
    (a, b) => a + b,
    0
  );
  const totalTasks = Object.values(data.tasksByStatus).reduce(
    (a, b) => a + b,
    0
  );
  const totalDecisions = Object.values(data.decisionOutcomes).reduce(
    (a, b) => a + b,
    0
  );

  return (
    <PageShell title="Reports" description="Firm analytics and reporting">
      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Students" value={totalStudents} />
        <StatCard label="Total Applications" value={totalApps} />
        <StatCard label="Total Tasks" value={totalTasks} />
        <StatCard label="Conversations" value={data.totalConversations} />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Caseload */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Caseload Summary</h3>
          </CardHeader>
          <CardContent>
            {data.caseload.length === 0 ? (
              <p className="text-sm text-gray-400">
                No counselor assignments yet.
              </p>
            ) : (
              <div className="space-y-2">
                {data.caseload.map((c) => (
                  <div
                    key={c.name}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-gray-700">{c.name}</span>
                    <Badge variant="primary">{c.count} students</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Applications by Stage */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">
              Application Pipeline
            </h3>
          </CardHeader>
          <CardContent>
            <BarChart
              data={data.applicationsByStage}
              colorFn={(k) => stageColors[k] ?? "bg-gray-400"}
            />
          </CardContent>
        </Card>

        {/* Decision Outcomes */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Decision Outcomes</h3>
          </CardHeader>
          <CardContent>
            {totalDecisions === 0 ? (
              <p className="text-sm text-gray-400">
                No decisions recorded yet.
              </p>
            ) : (
              <BarChart
                data={data.decisionOutcomes}
                colorFn={(k) => decisionColors[k] ?? "bg-gray-400"}
              />
            )}
          </CardContent>
        </Card>

        {/* Students by Status */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Students by Status</h3>
          </CardHeader>
          <CardContent>
            <BarChart
              data={data.studentsByStatus}
              colorFn={(k) => statusColors[k] ?? "bg-gray-400"}
            />
          </CardContent>
        </Card>

        {/* Task Completion */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Task Completion</h3>
          </CardHeader>
          <CardContent>
            <BarChart
              data={data.tasksByStatus}
              colorFn={(k) => taskColors[k] ?? "bg-gray-400"}
            />
          </CardContent>
        </Card>

        {/* Communication Activity */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">
              Communication Activity
            </h3>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center py-4">
              <p className="text-4xl font-bold text-primary-600">
                {data.totalConversations}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                total conversation{data.totalConversations !== 1 && "s"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
