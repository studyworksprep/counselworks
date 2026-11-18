import { cn } from "@/lib/utils";
import { StatusIcon } from "@/components/ui/status-chip";

/**
 * Step marker states (design refresh, phase 2). Shape carries the state and
 * color supports it, so markers still read in grayscale.
 */
export type StepMarkerState =
  | "done"
  | "next"
  | "active"
  | "todo"
  | "overdue"
  | "blocked"
  | "skipped";

const STYLES: Record<StepMarkerState, string> = {
  done: "bg-success-700 text-white",
  next: "border-2 border-primary-600 bg-white",
  active: "border-2 border-primary-600 bg-white text-primary-700",
  todo: "border-2 border-gray-300 bg-white",
  overdue: "border-2 border-danger-600 bg-white text-danger-700",
  blocked: "border-2 border-gray-300 bg-gray-100 text-gray-500",
  skipped: "border-2 border-dashed border-gray-400 bg-white text-gray-500",
};

export function StepMarker({
  state,
  number,
  size = "md",
  className,
}: {
  state: StepMarkerState;
  /** Optional step number for process headers ("2"). */
  number?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const dim = size === "sm" ? "h-5 w-5" : "h-6 w-6";
  const icon = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "box-border flex shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        dim,
        STYLES[state],
        className
      )}
    >
      {state === "done" ? (
        <StatusIcon name="check" className={icon} />
      ) : state === "next" ? (
        <span className="h-2.5 w-2.5 rounded-full bg-primary-600" />
      ) : state === "active" ? (
        <StatusIcon name="half" className={icon} />
      ) : state === "overdue" ? (
        <StatusIcon name="alert" className={icon} />
      ) : state === "blocked" ? (
        <StatusIcon name="lock" className={icon} />
      ) : state === "skipped" ? (
        <StatusIcon name="minus" className={icon} />
      ) : number !== undefined ? (
        <span className="text-gray-600">{number}</span>
      ) : null}
    </span>
  );
}
