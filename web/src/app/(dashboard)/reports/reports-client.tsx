"use client";

import { PageShell } from "@/components/layout/page-shell";
import { StatCard } from "@/components/cards/stat-card";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useDebouncedFilter } from "@/lib/hooks/use-debounced-filter";
import { ROUND_SHORT_LABELS } from "@/lib/constants/applications";
import type { DecisionRosterRow } from "@/lib/db/queries";

/** Client-side CSV export (fix plan 10.2). */
function exportRosterCsv(rows: DecisionRosterRow[]) {
  const esc = (v: string | number | null) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const header = [
    "Student",
    "Class",
    "College",
    "Round",
    "Decision",
    "Decision date",
    "Deposit",
  ];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        esc(r.student_name),
        esc(r.graduation_year),
        esc(r.college_name),
        esc(ROUND_SHORT_LABELS[r.application_type] ?? r.application_type),
        esc(r.decision_result),
        esc(r.decision_at ? r.decision_at.slice(0, 10) : ""),
        esc(r.deposit_status),
      ].join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "decision-roster.csv";
  a.click();
  URL.revokeObjectURL(url);
}

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
// Color maps
// ---------------------------------------------------------------------------
// Matches the shared student status enum (src/lib/constants/students.ts).
const statusColors: Record<string, string> = {
  active: "bg-success-500",
  paused: "bg-warning-500",
  graduated: "bg-purple-400",
  archived: "bg-gray-400",
};

// Matches the stages the kanban actually writes.
const stageColors: Record<string, string> = {
  not_started: "bg-gray-400",
  in_progress: "bg-blue-400",
  submitted: "bg-success-500",
  under_review: "bg-warning-500",
  decision_received: "bg-purple-500",
  withdrawn: "bg-danger-400",
};

const decisionColors: Record<string, string> = {
  accepted: "bg-success-500",
  rejected: "bg-danger-500",
  waitlisted: "bg-warning-500",
  deferred: "bg-orange-500",
};

const taskColors: Record<string, string> = {
  pending: "bg-warning-500",
  in_progress: "bg-blue-500",
  completed: "bg-success-500",
  cancelled: "bg-gray-400",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
interface ListBalanceRow {
  student_id: string;
  student_name: string;
  graduation_year: number;
  list_size: number;
  balance: {
    reach: number;
    target: number;
    likely: number;
    unclassified: number;
    warnings: string[];
  };
}

export function ReportsClient({
  data,
  roster = [],
  staff = [],
  listBalance = [],
}: {
  data: ReportData | null;
  roster?: DecisionRosterRow[];
  staff?: { id: string; name: string }[];
  listBalance?: ListBalanceRow[];
}) {
  const { searchParams, setParam } = useDebouncedFilter("/reports");
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 8 }, (_, i) => ({
    value: String(currentYear - 1 + i),
    label: `Class of ${currentYear - 1 + i}`,
  }));

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
      {/* Scoping (fix plan 10.2) */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Select
          placeholder="All class years"
          value={searchParams.get("class_year") ?? ""}
          onChange={(e) => setParam("class_year", e.target.value)}
          options={yearOptions}
          className="w-44"
        />
        <Select
          placeholder="All counselors"
          value={searchParams.get("counselor_id") ?? ""}
          onChange={(e) => setParam("counselor_id", e.target.value)}
          options={staff.map((s) => ({ value: s.id, label: s.name }))}
          className="w-52"
        />
      </div>

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard title="Total Students" value={totalStudents} />
        <StatCard title="Total Applications" value={totalApps} />
        <StatCard title="Total Tasks" value={totalTasks} />
        <StatCard title="Conversations" value={data.totalConversations} />
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
      {/* Decision roster (fix plan 10.2): where everyone stands */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Decision Roster</h3>
            {roster.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => exportRosterCsv(roster)}
              >
                Export CSV
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {roster.length === 0 ? (
            <p className="text-sm text-gray-400">
              No decisions recorded in this scope yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-3">Student</th>
                    <th className="py-2 pr-3">Class</th>
                    <th className="py-2 pr-3">College</th>
                    <th className="py-2 pr-3">Round</th>
                    <th className="py-2 pr-3">Decision</th>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2">Deposit</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((r, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2 pr-3 font-medium text-gray-900">
                        {r.student_name}
                      </td>
                      <td className="py-2 pr-3 text-gray-600">
                        {r.graduation_year}
                      </td>
                      <td className="py-2 pr-3 text-gray-600">
                        {r.college_name}
                      </td>
                      <td className="py-2 pr-3 text-gray-600">
                        {ROUND_SHORT_LABELS[r.application_type] ??
                          r.application_type}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge
                          variant={
                            r.decision_result === "accepted"
                              ? "success"
                              : r.decision_result === "rejected"
                                ? "danger"
                                : "warning"
                          }
                        >
                          {r.decision_result}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 text-gray-600">
                        {r.decision_at ? r.decision_at.slice(0, 10) : "—"}
                      </td>
                      <td className="py-2 capitalize text-gray-600">
                        {r.deposit_status ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* List balance (fix plan 10.8): reach/target/likely across students */}
      <Card className="mt-6">
        <CardHeader>
          <h3 className="font-semibold text-gray-900">College List Balance</h3>
          <p className="mt-0.5 text-sm text-gray-500">
            Reach / target / likely mix per active student, classified from
            acceptance rates and test-score position.
          </p>
        </CardHeader>
        <CardContent>
          {listBalance.length === 0 ? (
            <p className="text-sm text-gray-400">No active students.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-3">Student</th>
                    <th className="py-2 pr-3">Class</th>
                    <th className="py-2 pr-3 text-right">List</th>
                    <th className="py-2 pr-3 text-right">Reach</th>
                    <th className="py-2 pr-3 text-right">Target</th>
                    <th className="py-2 pr-3 text-right">Likely</th>
                    <th className="py-2">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {listBalance.map((r) => (
                    <tr key={r.student_id} className="border-b border-gray-100">
                      <td className="py-2 pr-3 font-medium text-gray-900">
                        {r.student_name}
                      </td>
                      <td className="py-2 pr-3 text-gray-600">
                        {r.graduation_year}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-gray-600">
                        {r.list_size}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-danger-600">
                        {r.balance.reach}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-primary-600">
                        {r.balance.target}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-success-700">
                        {r.balance.likely}
                      </td>
                      <td className="py-2">
                        {r.list_size === 0 ? (
                          <Badge variant="warning">Empty list</Badge>
                        ) : r.balance.warnings.length > 0 ? (
                          <span className="flex flex-wrap gap-1">
                            {r.balance.warnings.map((w) => (
                              <Badge key={w} variant="warning">
                                {w}
                              </Badge>
                            ))}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">
                            Balanced
                          </span>
                        )}
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
