import { cn } from "@/lib/utils";

export interface TimelineItem {
  id: string;
  /** Preformatted date, e.g. "Mar 26, 2027". */
  date: string;
  title: React.ReactNode;
  detail?: React.ReactNode;
  meta?: React.ReactNode;
  tone?: "done" | "active" | "attention" | "neutral";
}

const DOT: Record<NonNullable<TimelineItem["tone"]>, string> = {
  done: "bg-success-600",
  active: "bg-primary-600",
  attention: "bg-warning-600",
  neutral: "box-border border-2 border-gray-400 bg-white",
};

/**
 * Dated timeline (design refresh, phase 2): newest first, a dot per entry
 * on a connecting line. For decision history, recorded milestones, and
 * activity feeds.
 */
export function Timeline({
  items,
  label,
  className,
}: {
  items: TimelineItem[];
  label?: string;
  className?: string;
}) {
  return (
    <ol aria-label={label} className={cn("list-none", className)}>
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <li key={item.id} className="grid grid-cols-[0.75rem_minmax(0,1fr)] gap-x-3">
            <div className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className={cn("mt-1 h-3 w-3 shrink-0 rounded-full", DOT[item.tone ?? "neutral"])}
              />
              {!last && (
                <span aria-hidden="true" className="my-1 w-0.5 flex-1 rounded-full bg-gray-200" />
              )}
            </div>
            <div className={cn("min-w-0", last ? "pb-1" : "pb-5")}>
              <p className="text-xs font-semibold tabular-nums text-gray-700">{item.date}</p>
              <div className="mt-0.5 text-sm font-semibold text-gray-900">{item.title}</div>
              {item.detail && <div className="mt-0.5 text-sm text-gray-700">{item.detail}</div>}
              {item.meta && <p className="mt-0.5 text-xs text-gray-600">{item.meta}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
