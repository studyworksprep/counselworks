import { cn } from "@/lib/utils";
import { StepMarker } from "./step-marker";

export interface ProcessStep {
  key: string;
  title: string;
  detail?: string;
  state: "done" | "current" | "attention" | "upcoming";
}

const BAR: Record<ProcessStep["state"], string> = {
  done: "bg-success-600",
  current: "bg-primary-600",
  attention: "bg-warning-500",
  upcoming: "bg-gray-200",
};

/**
 * Numbered process header (design refresh, phase 2): where a multi-phase
 * flow stands — final review, booking, essay review — with the current
 * phase called out. Section headings below keep their own numbering.
 */
export function ProcessSteps({
  steps,
  label,
  className,
}: {
  steps: ProcessStep[];
  label: string;
  className?: string;
}) {
  return (
    <ol
      aria-label={label}
      className={cn(
        "grid list-none gap-4 sm:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]",
        className
      )}
    >
      {steps.map((step, index) => (
        <li
          key={step.key}
          aria-current={step.state === "current" || step.state === "attention" ? "step" : undefined}
          className="flex flex-col gap-3"
        >
          <span aria-hidden="true" className={cn("h-1 rounded-full", BAR[step.state])} />
          <div className="flex items-start gap-2.5">
            {step.state === "done" ? (
              <StepMarker state="done" />
            ) : step.state === "upcoming" ? (
              <StepMarker state="todo" number={index + 1} />
            ) : (
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white",
                  step.state === "attention" ? "bg-warning-700" : "bg-primary-600"
                )}
              >
                {index + 1}
              </span>
            )}
            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm font-semibold",
                  step.state === "upcoming" ? "text-gray-600" : "text-gray-900"
                )}
              >
                {step.title}
              </p>
              {step.detail && (
                <p
                  className={cn(
                    "mt-0.5 text-xs",
                    step.state === "current"
                      ? "font-medium text-primary-700"
                      : step.state === "attention"
                        ? "font-medium text-warning-800"
                        : "text-gray-600"
                  )}
                >
                  {step.detail}
                </p>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
