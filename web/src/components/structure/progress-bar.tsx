import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/constants/tones";
import { TONE_FILL } from "@/components/ui/tones";

/**
 * Labelled progress bar (design refresh, phase 2). The caption row carries
 * the words; the bar is the shape. Use for counts with a clear total —
 * steps, requirements, words against a limit.
 */
export function ProgressBar({
  label,
  value,
  max,
  caption,
  tone = "active",
  size = "md",
  className,
}: {
  /** Accessible name, e.g. "Your steps". Shown unless `caption` is false. */
  label: string;
  value: number;
  max: number;
  /** Right-hand text, e.g. "1 of 2". Defaults to "{value} of {max}". */
  caption?: React.ReactNode | false;
  tone?: StatusTone;
  size?: "sm" | "md";
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cn("min-w-0", className)}>
      {caption !== false && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
          <span className="font-semibold text-gray-900">{label}</span>
          <span className="tabular-nums text-gray-600">
            {caption ?? `${value} of ${max}`}
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        className={cn(
          "w-full overflow-hidden rounded-full bg-gray-100",
          size === "sm" ? "h-1.5" : "h-2"
        )}
      >
        <div
          className={cn("h-full rounded-full transition-all", TONE_FILL[tone])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
