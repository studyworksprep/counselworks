import {
  WORKFLOW_STATUS_LABELS,
  WORKFLOW_STATUS_TONES,
  WORKFLOW_STEP_STATUS_LABELS,
  WORKFLOW_STEP_STATUS_TONES,
} from "@/lib/constants/tasks";
import { taskPath } from "@/lib/constants/task-links";
import { Card } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { LinkButton } from "@/components/ui/link-button";
import { ArrowLink } from "@/components/ui/arrow-link";
import { StatusIcon } from "@/components/ui/status-chip";
import { ProgressBar } from "@/components/structure/progress-bar";
import { PlanSteps, type PlanStepItem } from "@/components/structure/plan-steps";
import type { StepMarkerState } from "@/components/structure/step-marker";
import { formatDate, humanizeToken } from "@/lib/utils";
import type { WorkflowProgress } from "@/lib/db/queries";

type PortalSurface = "student" | "family";
type Step = WorkflowProgress["visible_steps"][number];

interface Props {
  workflows: WorkflowProgress[];
  emptyText?: string;
  showAssignee?: boolean;
  /** Portal the list renders in; enables task and message links. */
  surface?: PortalSurface;
  /** Card title level: h2 on a page of plans, h3 under a per-student heading. */
  headingLevel?: "h2" | "h3";
}

const OPEN = new Set(["pending", "in_progress"]);

function markerFor(step: Step, overdue: boolean): StepMarkerState {
  if (step.status === "completed") return "done";
  if (step.status === "skipped") return "skipped";
  if (step.status === "blocked") return "blocked";
  if (overdue) return "overdue";
  return step.status === "in_progress" ? "active" : "todo";
}

function toItem(
  step: Step,
  today: string,
  showAssignee: boolean,
  surface: PortalSurface | undefined
): PlanStepItem {
  const open = OPEN.has(step.status);
  const overdue = open && !!step.due_date && step.due_date.slice(0, 10) < today;
  const owned = open || step.status === "blocked";
  return {
    id: step.id,
    title: step.title,
    href: step.task_id ? taskPath(step.task_id, surface) : null,
    description: step.description,
    note: step.waiting_reason,
    marker: markerFor(step, overdue),
    status: overdue
      ? { tone: "problem", label: "Overdue" }
      : {
          tone: WORKFLOW_STEP_STATUS_TONES[step.status] ?? "neutral",
          label:
            WORKFLOW_STEP_STATUS_LABELS[step.status] ?? humanizeToken(step.status),
        },
    owner: !owned
      ? null
      : showAssignee && step.assignee_name
        ? { label: step.assignee_name, you: step.is_mine }
        : { label: step.is_mine ? "You" : "Waiting on others", you: step.is_mine },
    due: step.due_date
      ? `Due ${formatDate(step.due_date)}${step.estimated ? " (estimated / unverified)" : ""}`
      : null,
  };
}

export function WorkflowProgressList({
  workflows,
  emptyText = "No workflows yet.",
  showAssignee = false,
  surface,
  headingLevel = "h3",
}: Props) {
  if (workflows.length === 0) {
    return <p className="text-sm text-gray-600">{emptyText}</p>;
  }

  return (
    <div className="space-y-6">
      {workflows.map((wf) => (
        <WorkflowProgressCard
          key={wf.id}
          workflow={wf}
          showAssignee={showAssignee}
          surface={surface}
          headingLevel={headingLevel}
        />
      ))}
    </div>
  );
}

function WorkflowProgressCard({
  workflow,
  showAssignee,
  surface,
  headingLevel: Heading,
}: {
  workflow: WorkflowProgress;
  showAssignee: boolean;
  surface?: PortalSurface;
  headingLevel: "h2" | "h3";
}) {
  const today = new Date().toISOString().slice(0, 10);
  const items = workflow.visible_steps.map((step) =>
    toItem(step, today, showAssignee, surface)
  );
  // The viewer's next step: their first open, unblocked step with a task.
  const nextStep = workflow.visible_steps.find(
    (step) => step.is_mine && OPEN.has(step.status) && step.task_id
  );
  const messagesPath =
    surface === "family" ? "/family-messages" : surface === "student" ? "/student-messages" : null;

  return (
    <Card className="max-w-4xl">
      <div className="space-y-4 border-b border-gray-200 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Heading className="text-base font-semibold text-gray-900">
              {workflow.name}
            </Heading>
            {workflow.template_name &&
              workflow.template_name !== workflow.name && (
                <p className="mt-0.5 text-xs text-gray-600">
                  From template: {workflow.template_name}
                </p>
              )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <StatusChip tone={WORKFLOW_STATUS_TONES[workflow.status] ?? "neutral"}>
              {WORKFLOW_STATUS_LABELS[workflow.status] ?? "Unknown state"}
            </StatusChip>
            {workflow.due_date && (
              <span className="text-xs tabular-nums text-gray-600">
                Due {formatDate(workflow.due_date)}
              </span>
            )}
          </div>
        </div>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {workflow.my_total_steps > 0 && (
            <ProgressBar
              label="Your steps"
              value={workflow.my_completed_steps}
              max={workflow.my_total_steps}
              caption={`${workflow.my_completed_steps} of ${workflow.my_total_steps} complete`}
            />
          )}
          <ProgressBar
            label="Whole plan"
            value={workflow.completed_steps}
            max={workflow.total_steps}
            caption={`${workflow.completed_steps} of ${workflow.total_steps} steps`}
            tone={workflow.my_total_steps > 0 ? "neutral" : "active"}
          />
        </div>
      </div>

      <div className="px-6 py-5">
        {items.length === 0 ? (
          <p className="text-sm text-gray-600">No steps visible.</p>
        ) : (
          <PlanSteps
            label={workflow.name}
            steps={items}
            next={
              nextStep
                ? {
                    stepId: nextStep.id,
                    overline: "Your next step",
                    actions: (
                      <>
                        <LinkButton href={taskPath(nextStep.task_id!, surface)} size="sm">
                          Open task
                        </LinkButton>
                        {messagesPath && (
                          <ArrowLink
                            href={`${messagesPath}?task=${encodeURIComponent(nextStep.task_id!)}`}
                          >
                            Ask about this task
                          </ArrowLink>
                        )}
                      </>
                    ),
                  }
                : null
            }
          />
        )}
      </div>

      <p className="flex items-center gap-2 border-t border-gray-100 px-6 py-3 text-xs text-gray-600">
        <StatusIcon name="lock" />
        Overall progress can include private staff work; only work shared with you is shown.
      </p>
    </Card>
  );
}
