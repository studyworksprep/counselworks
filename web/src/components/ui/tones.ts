import type { StatusTone } from "@/lib/constants/tones";

/**
 * Tailwind classes for each status tone (constants/tones.ts). Chips, board
 * columns, step markers, and chart bars read these instead of raw palette
 * colors. Chip pairs keep text at 6:1 or better against their fill.
 */
export const TONE_CHIP: Record<StatusTone, string> = {
  neutral: "bg-gray-100 text-gray-700",
  active: "bg-primary-100 text-primary-800",
  done: "bg-success-100 text-success-800",
  attention: "bg-warning-100 text-warning-800",
  problem: "bg-danger-100 text-danger-800",
  muted: "bg-white text-gray-600 ring-1 ring-inset ring-gray-300",
};

/** Large tinted areas: board columns, highlighted rows. */
export const TONE_SURFACE: Record<StatusTone, string> = {
  neutral: "bg-gray-50",
  active: "bg-primary-50",
  done: "bg-success-50",
  attention: "bg-warning-50",
  problem: "bg-danger-50",
  muted: "bg-white",
};

/** Solid fills: progress segments and chart bars. */
export const TONE_FILL: Record<StatusTone, string> = {
  neutral: "bg-gray-400",
  active: "bg-primary-500",
  done: "bg-success-600",
  attention: "bg-warning-500",
  problem: "bg-danger-600",
  muted: "bg-gray-300",
};

/**
 * Icon discs: a tinted circle with a ring, for lane and step headers.
 * Icon color stays at 4.5:1 or better against the disc.
 */
export const TONE_ICON: Record<StatusTone, string> = {
  neutral: "bg-gray-100 text-gray-600 ring-gray-200",
  active: "bg-primary-50 text-primary-700 ring-primary-200",
  done: "bg-success-50 text-success-700 ring-success-200",
  attention: "bg-warning-50 text-warning-800 ring-warning-200",
  problem: "bg-danger-50 text-danger-700 ring-danger-200",
  muted: "bg-white text-gray-500 ring-gray-300",
};
