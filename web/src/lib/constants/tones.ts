/**
 * Semantic status tones (design refresh, phase 1).
 *
 * Every status enum maps its values to one of these tones in its own constants
 * module (next to its labels), and every chip, step marker, board column, and
 * chart bar reads the tone. Pages never pick raw palette colors for a status:
 * that is how three competing status-color systems grew up (fix plan 9.4).
 */
export type StatusTone =
  | "neutral" // not started / to do
  | "active" // moving: in progress, submitted, under review
  | "done" // complete, approved, accepted, received
  | "attention" // needs a person: changes requested, waitlisted, paused
  | "problem" // overdue, failed, blocked by an error
  | "muted"; // skipped, cancelled, waived, withdrawn

/** Bridge for enums that already carry a Badge variant (students, essays). */
export const BADGE_VARIANT_TONES: Record<string, StatusTone> = {
  default: "neutral",
  primary: "active",
  success: "done",
  warning: "attention",
  danger: "problem",
  outline: "muted",
};
