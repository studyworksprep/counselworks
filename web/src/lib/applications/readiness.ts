import { dateOnly, offsetDate } from "../tasks/due-date";

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
