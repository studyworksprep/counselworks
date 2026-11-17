import Link from "next/link";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/constants/tones";
import {
  StatusChip,
  StatusIcon,
  type StatusIconName,
} from "@/components/ui/status-chip";
import { StepMarker, type StepMarkerState } from "./step-marker";

/**
 * One step on a plan rail. Callers map their own data into this shape with
 * labels and tones from lib/constants, so the rail never sees raw values.
 */
export interface PlanStepItem {
  id: string;
  title: string;
  href?: string | null;
  description?: string | null;
  /** Why the step is waiting (prerequisite text), shown beside the owner. */
  note?: string | null;
  marker: StepMarkerState;
  status: { tone: StatusTone; label: string; icon?: StatusIconName };
  /** Who the step belongs to; omit for finished steps. */
  owner?: { label: string; you: boolean } | null;
  /** Preformatted date line, e.g. "Due Sep 9, 2026". */
  due?: string | null;
}

function OwnerChip({ owner }: { owner: NonNullable<PlanStepItem["owner"]> }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full py-0.5 pl-2 pr-2.5 text-xs",
        owner.you
          ? "bg-primary-50 font-semibold text-primary-800 ring-1 ring-inset ring-primary-200"
          : "bg-gray-100 font-medium text-gray-700"
      )}
    >
      <StatusIcon name="person" />
      {owner.label}
    </span>
  );
}

function StepBody({
  step,
  overline,
}: {
  step: PlanStepItem;
  overline?: string;
}) {
  const finished = step.marker === "done" || step.marker === "skipped";
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="min-w-0 flex-[1_1_16rem] space-y-1.5">
        {overline && (
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-700">
            {overline}
          </p>
        )}
        <p
          className={cn(
            "break-words text-sm font-semibold",
            finished ? "text-gray-600" : "text-gray-900",
            overline && "text-base"
          )}
        >
          {step.href ? (
            <Link
              href={step.href}
              className="underline-offset-2 hover:text-primary-700 hover:underline"
            >
              {step.title}
            </Link>
          ) : (
            step.title
          )}
        </p>
        {step.description && (
          <p className="whitespace-pre-wrap break-words text-sm text-gray-600">
            {step.description}
          </p>
        )}
        {(step.owner || step.note) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {step.owner && <OwnerChip owner={step.owner} />}
            {step.note && (
              <span className="text-xs text-gray-600">{step.note}</span>
            )}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
        <StatusChip tone={step.status.tone} icon={step.status.icon}>
          {step.status.label}
        </StatusChip>
        {step.due && (
          <span className="text-xs tabular-nums text-gray-600">{step.due}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Plan steps (design refresh, phase 2): a vertical rail with a state marker
 * per step, owner and timing on every row, and the viewer's next step raised
 * into a highlighted panel with its actions. Replaces dot-and-text lists.
 */
export function PlanSteps({
  steps,
  next,
  label,
}: {
  steps: PlanStepItem[];
  /** The viewer's next step, highlighted with its actions. */
  next?: { stepId: string; overline: string; actions?: React.ReactNode } | null;
  /** Accessible name for the list, e.g. the plan name. */
  label?: string;
}) {
  return (
    <ol aria-label={label} className="list-none">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const isNext = next?.stepId === step.id;
        return (
          <li
            key={step.id}
            className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-4"
          >
            <div className="flex flex-col items-center">
              <StepMarker state={isNext ? "next" : step.marker} />
              {!last && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "my-1 w-0.5 flex-1 rounded-full",
                    step.marker === "done" ? "bg-success-200" : "bg-gray-200"
                  )}
                />
              )}
            </div>
            {isNext ? (
              <div className="-mt-2.5 mb-5 min-w-0 rounded-xl bg-primary-50 p-3 ring-1 ring-inset ring-primary-200 sm:px-4">
                <StepBody step={step} overline={next.overline} />
                {next.actions && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {next.actions}
                  </div>
                )}
              </div>
            ) : (
              <div className={cn("min-w-0 pt-0.5", last ? "pb-1" : "pb-6")}>
                <StepBody step={step} />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
