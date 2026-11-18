import { dateOnly, offsetDate } from "../tasks/due-date";

/** The application readiness page for a student on each surface. */
export function applicationReadinessPath(
  studentId: string,
  surface: "staff" | "student" | "family",
): string {
  return surface === "staff"
    ? `/students/${studentId}/readiness`
    : surface === "student"
      ? "/student-readiness"
      : `/family-readiness/${studentId}`;
}

/** Compare all-day deadlines with the firm's calendar day, not UTC midnight. */
export function deadlineAttention(
  deadline: string | null,
  today: string,
  stage: string | null,
) {
  if (
    !deadline ||
    !dateOnly.safeParse(today).success ||
    ["submitted", "under_review", "decision_received", "withdrawn"].includes(
      stage ?? "",
    )
  )
    return null;
  const date = deadline.slice(0, 10);
  if (!dateOnly.safeParse(date).success) return null;
  if (date < today) return "Past due";
  if (date <= offsetDate(today, 14)) return "Due soon";
  return null;
}
