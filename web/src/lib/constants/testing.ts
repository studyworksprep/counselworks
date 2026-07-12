/**
 * Single source of truth for testing-plan enums (fix plan 10.6;
 * CLAUDE.md rule 4). Structured sittings complement the free-form
 * student_profiles.testing_summary_json score summary.
 */

export const TEST_TYPES = [
  { value: "sat", label: "SAT" },
  { value: "act", label: "ACT" },
  { value: "psat", label: "PSAT" },
  { value: "ap", label: "AP Exam" },
  { value: "ib", label: "IB Exam" },
  { value: "toefl", label: "TOEFL" },
  { value: "other", label: "Other" },
] as const;

export const TEST_TYPE_VALUES = new Set<string>(TEST_TYPES.map((t) => t.value));

export const TEST_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  TEST_TYPES.map((t) => [t.value, t.label])
);

export const SITTING_STATUSES = [
  { value: "planned", label: "Planned", badge: "default" },
  { value: "registered", label: "Registered", badge: "primary" },
  { value: "completed", label: "Completed", badge: "success" },
  { value: "cancelled", label: "Cancelled", badge: "danger" },
] as const;

export const SITTING_STATUS_VALUES = new Set<string>(
  SITTING_STATUSES.map((s) => s.value)
);

export const SITTING_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  SITTING_STATUSES.map((s) => [s.value, s.label])
);

export const SITTING_STATUS_BADGES: Record<string, string> = Object.fromEntries(
  SITTING_STATUSES.map((s) => [s.value, s.badge])
);

export interface SittingLike {
  status: string;
  test_date: string | null;
  registration_deadline: string | null;
}

/**
 * A registration deadline needs attention when the sitting is still only
 * planned and the deadline is within `windowDays` (or already past).
 * `today` is YYYY-MM-DD.
 */
export function registrationNeedsAttention(
  sitting: SittingLike,
  today: string,
  windowDays = 21
): boolean {
  if (sitting.status !== "planned" || !sitting.registration_deadline) {
    return false;
  }
  const deadline = new Date(`${sitting.registration_deadline}T00:00:00Z`);
  const now = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(deadline.getTime()) || Number.isNaN(now.getTime())) {
    return false;
  }
  const diffDays = (deadline.getTime() - now.getTime()) / 86_400_000;
  return diffDays <= windowDays;
}
