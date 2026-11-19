import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/constants/tones";
import { TONE_FILL, TONE_ICON } from "@/components/ui/tones";
import { Icon, type IconName } from "@/components/ui/icon";
import { ChevronRightIcon } from "@/components/icons";

/**
 * Board (design refresh): a process laid out as separate lanes, one per
 * step. Each lane is its own tinted surface with a header (step icon,
 * name, position, count), and a chevron in the gutter between lanes shows
 * the direction of travel, so cards read as belonging to a step rather
 * than to a column of loosely aligned boxes.
 *
 * Wide screens fit every lane; narrower ones scroll the board sideways
 * (snapping lane by lane on phones) instead of wrapping lanes into rows,
 * which broke the left-to-right order of the steps.
 */
export function Board({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "-mx-4 flex items-start snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0 lg:snap-none",
        className
      )}
    >
      {children}
    </div>
  );
}

export function BoardLane({
  id,
  title,
  icon,
  tone,
  count,
  position,
  exit = false,
  connector = false,
  emptyLabel = "Nothing here",
  noun = ["item", "items"],
  children,
}: {
  id: string;
  title: string;
  icon: IconName;
  tone: StatusTone;
  count: number;
  /** "Step 2 of 5", or a short note for an exit lane. */
  position?: string;
  /** A lane that leaves the process (withdrawn): set apart and muted. */
  exit?: boolean;
  /** Draw the step chevron in the gutter before this lane. */
  connector?: boolean;
  emptyLabel?: string;
  /** Singular and plural for the count's accessible name. */
  noun?: [string, string];
  children?: React.ReactNode;
}) {
  const headingId = `lane-${id}`;
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "relative flex w-[min(82vw,19rem)] shrink-0 snap-start flex-col rounded-2xl border lg:w-auto lg:min-w-[11rem] lg:flex-1 lg:basis-0",
        exit
          ? "border-dashed border-gray-300 bg-white"
          : "border-gray-200 bg-gray-50"
      )}
    >
      {connector && (
        <span
          aria-hidden="true"
          className="absolute -left-3 top-[1.125rem] flex w-3 justify-center text-gray-500"
        >
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </span>
      )}
      {exit && (
        // The exit lane stands apart from the steps: a dashed rule in the
        // gutter instead of a chevron.
        <span
          aria-hidden="true"
          className="absolute -left-[7px] top-2 bottom-2 hidden border-l border-dashed border-gray-300 lg:block"
        />
      )}
      {!exit && (
        <span
          aria-hidden="true"
          className={cn("absolute inset-x-4 top-0 h-[3px] rounded-b-full", TONE_FILL[tone])}
        />
      )}
      <header className="flex items-start gap-2 border-b border-gray-200 px-2.5 pb-2.5 pt-3">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset",
            TONE_ICON[tone]
          )}
        >
          <Icon name={icon} className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="text-sm font-semibold leading-5 text-gray-900">
            {title}
          </h3>
          {position && <p className="text-[11px] leading-4 text-gray-500">{position}</p>}
        </div>
        <span
          className={cn(
            "mt-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset",
            count > 0 ? "bg-white text-gray-800 ring-gray-300" : "bg-transparent text-gray-500 ring-gray-200"
          )}
          aria-label={`${count} ${count === 1 ? noun[0] : noun[1]}`}
        >
          {count}
        </span>
      </header>
      <div className="flex flex-col gap-2.5 p-2">
        {count === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 px-3 py-5 text-center text-xs text-gray-500">
            {emptyLabel}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
