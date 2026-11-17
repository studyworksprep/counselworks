import { cn, humanizeToken } from "@/lib/utils";
import { PIPELINE_STAGES, STAGE_LABELS } from "@/lib/constants/applications";

/**
 * Application stage track (design refresh, phase 2): five segments along the
 * pipeline, filled through the current stage, with the stage name beneath.
 * A withdrawn application leaves the path, so its track stays empty.
 */
export function StageTrack({
  stage,
  showLabel = true,
  className,
}: {
  stage: string;
  showLabel?: boolean;
  className?: string;
}) {
  const index = PIPELINE_STAGES.findIndex((s) => s.value === stage);
  const onPath = index >= 0;
  const total = PIPELINE_STAGES.length;
  const label = STAGE_LABELS[stage] ?? humanizeToken(stage);
  const fill = stage === "decision_received" ? "bg-success-600" : "bg-primary-600";
  return (
    <div className={cn("min-w-0", className)}>
      <div
        role="img"
        aria-label={onPath ? `Stage ${index + 1} of ${total}: ${label}` : label}
        className="grid grid-cols-5 gap-1"
      >
        {PIPELINE_STAGES.map((s, i) => (
          <span
            key={s.value}
            className={cn(
              "h-1.5 rounded-full",
              onPath && i <= index ? fill : "bg-gray-200"
            )}
          />
        ))}
      </div>
      {showLabel && (
        <div className="mt-1.5 flex items-baseline justify-between gap-2 text-xs">
          <span className="font-semibold text-gray-900">{label}</span>
          {onPath && (
            <span className="tabular-nums text-gray-600">
              Stage {index + 1} of {total}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
