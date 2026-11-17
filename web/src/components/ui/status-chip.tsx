import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/constants/tones";
import { TONE_CHIP } from "./tones";

export type StatusIconName =
  | "circle"
  | "half"
  | "check"
  | "clock"
  | "alert"
  | "lock"
  | "minus"
  | "person";

/** Each tone's default glyph, so status never relies on color alone. */
const DEFAULT_ICON: Record<StatusTone, StatusIconName> = {
  neutral: "circle",
  active: "half",
  done: "check",
  attention: "alert",
  problem: "alert",
  muted: "minus",
};

function IconPaths({ name }: { name: StatusIconName }) {
  switch (name) {
    case "circle":
      return <circle cx="8" cy="8" r="5.25" />;
    case "half":
      return (
        <>
          <circle cx="8" cy="8" r="5.25" />
          <path d="M8 2.75a5.25 5.25 0 0 1 0 10.5z" fill="currentColor" stroke="none" />
        </>
      );
    case "check":
      return <path d="M3.5 8.5l3 3 6-7" strokeWidth={2.25} />;
    case "clock":
      return (
        <>
          <circle cx="8" cy="8" r="5.75" />
          <path d="M8 4.75V8l2.25 1.5" />
        </>
      );
    case "alert":
      return (
        <>
          <path d="M8 2.5l6 10.5H2z" />
          <path d="M8 6.75v2.75" />
          <path d="M8 11.4v.1" />
        </>
      );
    case "lock":
      return (
        <>
          <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
          <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" />
        </>
      );
    case "minus":
      return <path d="M4 8h8" />;
    case "person":
      return (
        <>
          <circle cx="8" cy="5.5" r="2.5" />
          <path d="M3 13.5c.6-2.4 2.6-3.5 5-3.5s4.4 1.1 5 3.5" />
        </>
      );
  }
}

/** A small status glyph (16-unit grid) that inherits the text color. */
export function StatusIcon({
  name,
  className,
}: {
  name: StatusIconName;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-3 w-3 shrink-0", className)}
    >
      <IconPaths name={name} />
    </svg>
  );
}

/**
 * Status chip (design refresh, phase 1): icon + label in the tone's colors.
 * Pass the tone from the enum's tone map (e.g. TASK_STATUS_TONES) and the
 * label from its label map — never a raw database value.
 */
export function StatusChip({
  tone,
  icon,
  children,
  className,
}: {
  tone: StatusTone;
  icon?: StatusIconName;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full py-0.5 pl-2 pr-2.5 text-xs font-medium",
        TONE_CHIP[tone],
        className
      )}
    >
      <StatusIcon name={icon ?? DEFAULT_ICON[tone]} />
      {children}
    </span>
  );
}
