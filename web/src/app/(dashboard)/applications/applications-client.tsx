"use client";

import Link from "next/link";
import {
  ROUND_SHORT_LABELS,
  APPLICATION_ROUNDS,
  APPLICATION_STAGES,
  KANBAN_SETTABLE_STAGES,
} from "@/lib/constants/applications";
import { useRouter } from "next/navigation";
import { useDebouncedFilter } from "@/lib/hooks/use-debounced-filter";
import { useTransition } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { updateApplicationStage } from "@/lib/actions/applications";

// One stage definition for columns, filters, and the move dropdown
// (fix plan 7.6). "Decision Received" is a column but never a dropdown
// option — the Record Decision modal is the only writer of that stage.
const stages = APPLICATION_STAGES.map((s) => ({
  key: s.value,
  label: s.label,
  color: s.boardColor,
}));

const settableStageOptions = KANBAN_SETTABLE_STAGES.map((s) => ({
  value: s.value,
  label: s.label,
}));

const decisionColors: Record<string, "success" | "danger" | "warning" | "default"> = {
  accepted: "success",
  rejected: "danger",
  waitlisted: "warning",
  deferred: "warning",
};

// Single source of truth for round labels (short codes are canonical).

interface ApplicationRow {
  id: string;
  stage: string;
  checklist_done: number;
  checklist_total: number;
  application_type: string;
  deadline_at: string | null;
  submitted_at: string | null;
  decision_result: string | null;
  student_id: string;
  student_name: string;
  college_id: string;
  college_name: string;
}

export function ApplicationsClient({
  applications,
  students,
}: {
  applications: ApplicationRow[];
  students: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { searchParams, setParam, setSearchParamDebounced } =
    useDebouncedFilter("/applications");
  const [isPending, startTransition] = useTransition();

  function handleStageChange(appId: string, newStage: string) {
    startTransition(async () => {
      await updateApplicationStage(appId, newStage);
      router.refresh();
    });
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function isOverdue(deadlineAt: string | null) {
    if (!deadlineAt) return false;
    return new Date(deadlineAt) < new Date();
  }

  return (
    <PageShell
      title="Applications"
      description="Track application progress across all students"
      actions={
        <Button onClick={() => router.push("/applications/new")}>
          Add Application
        </Button>
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Input
          placeholder="Search by student or college..."
          defaultValue={searchParams.get("search") ?? ""}
          onChange={(e) => setSearchParamDebounced("search", e.target.value)}
          className="max-w-xs"
        />
        <Select
          placeholder="All stages"
          value={searchParams.get("stage") ?? ""}
          onChange={(e) => setParam("stage", e.target.value)}
          options={stages.map((s) => ({ value: s.key, label: s.label }))}
          className="w-44"
        />
        <Select
          placeholder="All students"
          value={searchParams.get("student_id") ?? ""}
          onChange={(e) => setParam("student_id", e.target.value)}
          options={students.map((s) => ({ value: s.id, label: s.name }))}
          className="w-44"
        />
        <Select
          placeholder="All rounds"
          value={searchParams.get("round") ?? ""}
          onChange={(e) => setParam("round", e.target.value)}
          options={APPLICATION_ROUNDS.map((r) => ({
            value: r.value,
            label: r.label,
          }))}
          className="w-44"
        />
        <Select
          placeholder="Any deadline"
          value={searchParams.get("due") ?? ""}
          onChange={(e) => setParam("due", e.target.value)}
          options={[
            { value: "soon", label: "Due within 30 days" },
            { value: "overdue", label: "Past deadline (open)" },
          ]}
          className="w-48"
        />
        <span className="text-sm text-gray-500">
          {applications.length} application{applications.length !== 1 && "s"}
        </span>
      </div>

      {applications.length === 0 ? (
        <Card>
          <EmptyState
            title="No applications yet"
            description="Applications will appear here once you add them for students."
            actionLabel="Add Application"
            onAction={() => router.push("/applications/new")}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {stages.map((stage) => {
            const stageApps = applications.filter(
              (a) => a.stage === stage.key
            );
            return (
              <div key={stage.key}>
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-700">
                    {stage.label}
                  </h3>
                  <Badge variant="default">{stageApps.length}</Badge>
                </div>
                <div className="space-y-3">
                  {stageApps.map((app) => (
                    <Card key={app.id} className={stage.color}>
                      <CardContent className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={`/applications/${app.id}`}
                            className="text-sm font-medium text-gray-900 hover:text-primary-600"
                          >
                            {app.college_name}
                          </Link>
                          <Badge variant="default">
                            {ROUND_SHORT_LABELS[app.application_type] ??
                              app.application_type}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500">
                          {app.student_name}
                        </p>
                        {app.deadline_at && (
                          <p
                            className={`text-xs ${isOverdue(app.deadline_at) && app.stage !== "submitted" && app.stage !== "under_review" && app.stage !== "decision_received" ? "font-medium text-danger-600" : "text-gray-500"}`}
                          >
                            Due: {formatDate(app.deadline_at)}
                          </p>
                        )}
                        {app.checklist_total > 0 && (
                          <p className="text-xs text-gray-400">
                            Checklist {app.checklist_done}/{app.checklist_total}
                          </p>
                        )}
                        {app.decision_result && (
                          <Badge
                            variant={
                              decisionColors[app.decision_result] ?? "default"
                            }
                          >
                            {app.decision_result}
                          </Badge>
                        )}
                        <div className="pt-1">
                          {app.stage === "decision_received" ? (
                            <p className="text-xs text-gray-400">
                              Decision recorded — manage from the application
                              page
                            </p>
                          ) : (
                            <Select
                              value={app.stage}
                              onChange={(e) =>
                                handleStageChange(app.id, e.target.value)
                              }
                              options={settableStageOptions}
                              className="text-xs"
                              disabled={isPending}
                            />
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
