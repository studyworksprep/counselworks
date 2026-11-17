"use client";

import { cn, formatCalendarDate, humanizeToken } from "@/lib/utils";

import Link from "next/link";
import {
  ROUND_SHORT_LABELS,
  APPLICATION_ROUNDS,
  APPLICATION_STAGES,
  KANBAN_SETTABLE_STAGES,
  DECISION_LABELS,
  DECISION_TONES,
} from "@/lib/constants/applications";
import { useRouter } from "next/navigation";
import { useDebouncedFilter } from "@/lib/hooks/use-debounced-filter";
import { useTransition } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { EmbeddedShell } from "@/components/layout/embedded-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusChip } from "@/components/ui/status-chip";
import { ArrowLink } from "@/components/ui/arrow-link";
import { ProgressBar } from "@/components/structure/progress-bar";
import { PipelineStrip } from "@/components/structure/pipeline-strip";
import { updateApplicationStage } from "@/lib/actions/applications";
import { TONE_SURFACE } from "@/components/ui/tones";

// One stage definition for the pipeline strip, columns, and the move
// dropdown (fix plan 7.6). "Decision received" is a column but never a
// dropdown option — the Record Decision modal is the only writer of that stage.
const stages = APPLICATION_STAGES.map((s) => ({
  key: s.value as string,
  label: s.label as string,
  tone: s.tone,
  color: TONE_SURFACE[s.tone],
}));

const settableStageOptions = KANBAN_SETTABLE_STAGES.map((s) => ({
  value: s.value,
  label: s.label,
}));

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

function isOverdue(deadlineAt: string | null) {
  if (!deadlineAt) return false;
  return new Date(deadlineAt) < new Date();
}

function BoardCard({
  app,
  surface,
  pending,
  onStageChange,
}: {
  app: ApplicationRow;
  surface: string;
  pending: boolean;
  onStageChange: (appId: string, stage: string) => void;
}) {
  const late =
    isOverdue(app.deadline_at) &&
    !["submitted", "under_review", "decision_received", "withdrawn"].includes(app.stage);
  return (
    <Card className={cn("min-w-0", surface)}>
      <CardContent className="space-y-3 px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/applications/${app.id}`}
            className="min-w-0 break-words text-sm font-semibold text-gray-900 underline-offset-2 hover:text-primary-700 hover:underline"
          >
            {app.college_name}
          </Link>
          <Badge variant="outline">
            {ROUND_SHORT_LABELS[app.application_type] ?? app.application_type}
          </Badge>
        </div>
        <p className="text-xs text-gray-600">{app.student_name}</p>
        {app.deadline_at && (
          <p
            className={cn(
              "text-xs tabular-nums",
              late ? "font-medium text-danger-700" : "text-gray-600"
            )}
          >
            Due: {formatCalendarDate(app.deadline_at)}
            {late && " · overdue"}
          </p>
        )}
        {app.checklist_total > 0 && (
          <div className="flex items-center gap-2">
            <ProgressBar
              className="flex-1"
              label={`Checklist for ${app.college_name}`}
              value={app.checklist_done}
              max={app.checklist_total}
              caption={false}
              tone={app.checklist_done === app.checklist_total ? "done" : "active"}
              size="sm"
            />
            <span className="text-xs tabular-nums text-gray-600">
              Checklist {app.checklist_done}/{app.checklist_total}
            </span>
          </div>
        )}
        {app.decision_result && (
          <StatusChip tone={DECISION_TONES[app.decision_result] ?? "neutral"}>
            {DECISION_LABELS[app.decision_result] ?? humanizeToken(app.decision_result)}
          </StatusChip>
        )}
        <div className="pt-1">
          {app.stage === "decision_received" ? (
            // Only the decision workspace writes this stage (fix plan 7.6),
            // so the card links there instead of offering a stage menu.
            <ArrowLink
              href={`/applications/${app.id}/decisions`}
              className="text-xs"
              aria-label={`Manage decision for ${app.student_name} — ${app.college_name}`}
            >
              Manage decision
            </ArrowLink>
          ) : (
            <Select
              aria-label={`Stage for ${app.student_name} — ${app.college_name}`}
              value={app.stage}
              onChange={(e) => onStageChange(app.id, e.target.value)}
              options={settableStageOptions}
              className="text-xs"
              disabled={pending}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ApplicationsClient({
  applications,
  students,
  embed,
}: {
  /** Every application matching the non-stage filters; the stage filter applies here. */
  applications: ApplicationRow[];
  students: { id: string; name: string }[];
  /**
   * Inside the student workspace (fix plan 13.0): filters push to the
   * student's own route, the student filter is fixed and hidden, and the
   * workspace layout provides the header.
   */
  embed?: { studentId: string; basePath: string };
}) {
  const router = useRouter();
  const { searchParams, setParam, setSearchParamDebounced } =
    useDebouncedFilter(embed?.basePath ?? "/applications");
  const Shell = embed ? EmbeddedShell : PageShell;
  const [isPending, startTransition] = useTransition();
  const stageFilter = searchParams.get("stage") || null;
  const visible = stageFilter
    ? applications.filter((a) => a.stage === stageFilter)
    : applications;

  function handleStageChange(appId: string, newStage: string) {
    startTransition(async () => {
      await updateApplicationStage(appId, newStage);
      router.refresh();
    });
  }

  return (
    <Shell
      title="Applications"
      description="Track application progress across all students"
      actions={
        <Button
          onClick={() =>
            router.push(
              embed
                ? `/applications/new?student_id=${embed.studentId}`
                : "/applications/new"
            )
          }
        >
          Add Application
        </Button>
      }
    >
      <div className="space-y-5">
        {applications.length > 0 && (
          <PipelineStrip
            label="Filter by stage"
            selected={stageFilter}
            onSelect={(key) => setParam("stage", key ?? "")}
            items={stages.map((stage) => ({
              key: stage.key,
              label: stage.label,
              tone: stage.tone,
              count: applications.filter((a) => a.stage === stage.key).length,
            }))}
          />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search by student or college..."
            aria-label="Search by student or college"
            defaultValue={searchParams.get("search") ?? ""}
            onChange={(e) => setSearchParamDebounced("search", e.target.value)}
            className="sm:max-w-xs"
          />
          {!embed && (
            <Select
              aria-label="Filter by student"
              placeholder="All students"
              value={searchParams.get("student_id") ?? ""}
              onChange={(e) => setParam("student_id", e.target.value)}
              options={students.map((s) => ({ value: s.id, label: s.name }))}
              className="w-full sm:w-44"
            />
          )}
          <Select
            aria-label="Filter by application round"
            placeholder="All rounds"
            value={searchParams.get("round") ?? ""}
            onChange={(e) => setParam("round", e.target.value)}
            options={APPLICATION_ROUNDS.map((r) => ({
              value: r.value,
              label: r.label,
            }))}
            className="w-full sm:w-44"
          />
          <Select
            aria-label="Filter by deadline"
            placeholder="Any deadline"
            value={searchParams.get("due") ?? ""}
            onChange={(e) => setParam("due", e.target.value)}
            options={[
              { value: "soon", label: "Due within 30 days" },
              { value: "overdue", label: "Past deadline (open)" },
            ]}
            className="w-full sm:w-48"
          />
          <span className="text-sm text-gray-600" role="status">
            {visible.length} application{visible.length !== 1 && "s"}
            {stageFilter && (
              <>
                {" "}
                ·{" "}
                <button
                  type="button"
                  className="font-medium text-primary-700 underline-offset-2 hover:underline"
                  onClick={() => setParam("stage", "")}
                >
                  Show all stages
                </button>
              </>
            )}
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
        ) : stageFilter ? (
          visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 p-6 text-sm text-gray-600">
              No applications at this stage.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visible.map((app) => (
                <BoardCard
                  key={app.id}
                  app={app}
                  surface={TONE_SURFACE[stages.find((s) => s.key === app.stage)?.tone ?? "neutral"]}
                  pending={isPending}
                  onStageChange={handleStageChange}
                />
              ))}
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            {stages.map((stage) => {
              const stageApps = visible.filter((a) => a.stage === stage.key);
              return (
                <div key={stage.key} className="min-w-0">
                  <div className="mb-3 flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-700">
                      {stage.label}
                    </h3>
                    <Badge variant="default">{stageApps.length}</Badge>
                  </div>
                  <div className="space-y-3">
                    {stageApps.map((app) => (
                      <BoardCard
                        key={app.id}
                        app={app}
                        surface={stage.color}
                        pending={isPending}
                        onStageChange={handleStageChange}
                      />
                    ))}
                    {stageApps.length === 0 && (
                      <p className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-500">
                        None at this stage
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
