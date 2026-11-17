import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/constants/tones";
import { TONE_FILL } from "@/components/ui/tones";

/**
 * Pipeline strip (design refresh, phase 2): a count per stage that doubles
 * as the stage filter. Selecting the active stage again clears the filter.
 * Render inside a client component (it takes an onSelect handler).
 */
export function PipelineStrip({
  label,
  items,
  selected,
  onSelect,
  disabled,
}: {
  label: string;
  items: { key: string; label: string; count: number; tone: StatusTone }[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6"
    >
      {items.map((item) => {
        const active = selected === item.key;
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onSelect(active ? null : item.key)}
            className={cn(
              "flex flex-col items-start gap-2 rounded-xl border bg-white px-3 pb-3 pt-2.5 text-left transition-colors disabled:opacity-60",
              active
                ? "border-primary-500 ring-2 ring-primary-200"
                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            )}
          >
            <span aria-hidden="true" className={cn("h-1 w-full rounded-full", TONE_FILL[item.tone])} />
            <span className="text-xs font-medium text-gray-600">{item.label}</span>
            <span
              className={cn(
                "text-xl font-bold tabular-nums",
                item.count === 0 ? "text-gray-500" : "text-gray-900"
              )}
            >
              {item.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
