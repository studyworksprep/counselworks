import { cn } from "@/lib/utils";
import { StatusIcon } from "@/components/ui/status-chip";
import { ProgressBar } from "./progress-bar";

export interface ChecklistItemView {
  key: string;
  label: string;
  done: boolean;
}

/**
 * Checklist with progress (design refresh, phase 2): a count and bar, then
 * each item with a filled check or an open ring. Replaces text-glyph and
 * bulleted requirement lists.
 */
export function Checklist({
  items,
  heading,
  headingLevel: Heading = "h3",
  showProgress = true,
  className,
}: {
  items: ChecklistItemView[];
  /** Visible heading; also names the progress bar. */
  heading?: string;
  headingLevel?: "h2" | "h3" | "h4";
  showProgress?: boolean;
  className?: string;
}) {
  const done = items.filter((item) => item.done).length;
  const showBar = showProgress && items.length > 0;
  const caption = `${done} of ${items.length} complete`;
  return (
    <div className={cn("min-w-0", className)}>
      {heading && (
        // The heading doubles as the bar's label, so the count shares its
        // row instead of repeating the heading above the bar.
        <div className="flex items-baseline justify-between gap-3">
          <Heading className="text-sm font-semibold text-gray-900">{heading}</Heading>
          {showBar && (
            <span className="text-xs tabular-nums text-gray-600">{caption}</span>
          )}
        </div>
      )}
      {showBar && (
        <ProgressBar
          className={heading ? "mt-2" : undefined}
          label={heading ?? "Checklist"}
          value={done}
          max={items.length}
          caption={heading ? false : caption}
          tone={done === items.length ? "done" : "active"}
          size="sm"
        />
      )}
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-2.5 text-sm">
            {item.done ? (
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success-700 text-white">
                <StatusIcon name="check" className="h-2.5 w-2.5" />
              </span>
            ) : (
              <span
                aria-hidden="true"
                className="mt-0.5 box-border h-4 w-4 shrink-0 rounded-full border-2 border-gray-400 bg-white"
              />
            )}
            <span className={item.done ? "text-gray-600" : "font-medium text-gray-900"}>
              {item.label}
              <span className="sr-only">{item.done ? " (complete)" : " (to do)"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
