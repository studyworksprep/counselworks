import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { WorkflowProgress } from "@/lib/db/queries";

interface Props {
  workflows: WorkflowProgress[];
  emptyText?: string;
  showAssignee?: boolean;
}

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

const STEP_STATUS_LABEL: Record<string, string> = {
  pending: "To do",
  in_progress: "In progress",
  completed: "Done",
  skipped: "Skipped",
  blocked: "Blocked",
};

const STEP_STATUS_DOT: Record<string, string> = {
  pending: "bg-gray-300",
  in_progress: "bg-primary-500",
  completed: "bg-success-500",
  skipped: "bg-gray-400",
  blocked: "bg-gray-200",
};

export function WorkflowProgressList({
  workflows,
  emptyText = "No workflows yet.",
  showAssignee = false,
}: Props) {
  if (workflows.length === 0) {
    return <p className="text-sm text-gray-500">{emptyText}</p>;
  }

  return (
    <div className="space-y-4">
      {workflows.map((wf) => (
        <WorkflowProgressCard
          key={wf.id}
          workflow={wf}
          showAssignee={showAssignee}
        />
      ))}
    </div>
  );
}

function WorkflowProgressCard({
  workflow,
  showAssignee,
}: {
  workflow: WorkflowProgress;
  showAssignee: boolean;
}) {
  const pct =
    workflow.total_steps === 0
      ? 0
      : Math.round((workflow.completed_steps / workflow.total_steps) * 100);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900">{workflow.name}</h3>
            {workflow.template_name &&
              workflow.template_name !== workflow.name && (
                <p className="text-xs text-gray-500">
                  From template: {workflow.template_name}
                </p>
              )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={WORKFLOW_STATUS_VARIANT[workflow.status] ?? "default"}>
              {workflow.status.replace(/_/g, " ")}
            </Badge>
            {workflow.due_date && (
              <span className="text-xs text-gray-500">
                Due {formatDate(workflow.due_date)}
              </span>
            )}
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>
              {workflow.completed_steps} of {workflow.total_steps} steps
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-primary-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {workflow.visible_steps.length === 0 ? (
          <p className="text-sm text-gray-500">
            No steps visible.
          </p>
        ) : (
          <ul className="space-y-2">
            {workflow.visible_steps.map((step) => (
              <li
                key={step.id}
                className="flex items-start gap-3"
              >
                <span
                  aria-hidden
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                    STEP_STATUS_DOT[step.status] ?? "bg-gray-300"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span
                      className={`text-sm ${
                        step.status === "completed" || step.status === "skipped"
                          ? "text-gray-500 line-through"
                          : "text-gray-900 font-medium"
                      }`}
                    >
                      {step.title}
                    </span>
                    <Badge variant="default">
                      {STEP_STATUS_LABEL[step.status] ?? step.status}
                    </Badge>
                  </div>
                  {step.description && (
                    <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">
                      {step.description}
                    </p>
                  )}
                  <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-gray-500">
                    {step.due_date && (
                      <span>Due {formatDate(step.due_date)}</span>
                    )}
                    {showAssignee && step.assignee_name && (
                      <span>{step.assignee_name}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
