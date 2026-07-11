"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { setStudentWorkflowStepStatus } from "@/lib/actions/workflows";
import type { WorkflowProgress } from "@/lib/db/queries";

const WORKFLOW_STATUS_VARIANT: Record<
  string,
  "primary" | "success" | "warning" | "default"
> = {
  in_progress: "primary",
  completed: "success",
  paused: "warning",
  not_started: "default",
  cancelled: "default",
};

const STEP_STATUS_DOT: Record<string, string> = {
  pending: "bg-gray-300",
  in_progress: "bg-primary-500",
  completed: "bg-success-500",
  skipped: "bg-gray-400",
  blocked: "bg-gray-200",
};

/**
 * Staff-side workflow list with direct step controls (fix plan 6.2):
 * complete/skip a step without hunting for its linked task. Task sync and
 * dependency activation run server-side in setStudentWorkflowStepStatus.
 */
export function StaffWorkflowList({
  workflows,
}: {
  workflows: WorkflowProgress[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (workflows.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No workflows assigned. Apply a template from the Workflows page.
      </p>
    );
  }

  function act(stepId: string, status: "completed" | "skipped") {
    startTransition(async () => {
      await setStudentWorkflowStepStatus(stepId, status);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {workflows.map((wf) => {
        const pct =
          wf.total_steps > 0
            ? Math.round((wf.completed_steps / wf.total_steps) * 100)
            : 0;
        return (
          <Card key={wf.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">
                    {wf.name}
                  </h4>
                  {wf.template_name && wf.template_name !== wf.name && (
                    <p className="text-xs text-gray-400">{wf.template_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={WORKFLOW_STATUS_VARIANT[wf.status] ?? "default"}
                  >
                    {wf.status.replace(/_/g, " ")}
                  </Badge>
                  <span className="text-xs text-gray-500">
                    {wf.completed_steps}/{wf.total_steps}
                  </span>
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-primary-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-gray-50">
                {wf.visible_steps.map((step) => {
                  const actionable =
                    step.status === "pending" || step.status === "in_progress";
                  return (
                    <li
                      key={step.id}
                      className="flex items-center justify-between gap-2 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            STEP_STATUS_DOT[step.status] ?? "bg-gray-300"
                          }`}
                        />
                        <span
                          className={`truncate text-sm ${
                            step.status === "completed" ||
                            step.status === "skipped"
                              ? "text-gray-400 line-through"
                              : "text-gray-800"
                          }`}
                        >
                          {step.title}
                        </span>
                        {step.due_date && (
                          <span className="shrink-0 text-xs text-gray-400">
                            {formatDate(step.due_date)}
                          </span>
                        )}
                        {step.assignee_name && (
                          <span className="hidden shrink-0 text-xs text-gray-400 sm:inline">
                            · {step.assignee_name}
                          </span>
                        )}
                      </div>
                      {actionable && (
                        <div className="flex shrink-0 gap-1.5">
                          <button
                            onClick={() => act(step.id, "completed")}
                            disabled={isPending}
                            className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-600 hover:border-success-500 hover:text-success-600 disabled:opacity-50"
                          >
                            Complete
                          </button>
                          <button
                            onClick={() => act(step.id, "skipped")}
                            disabled={isPending}
                            className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                          >
                            Skip
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
