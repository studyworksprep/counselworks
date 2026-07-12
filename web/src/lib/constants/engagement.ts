/**
 * Single source of truth for engagement-tracking enums and the
 * demonstrated-interest log format (fix plan 10.9; CLAUDE.md rule 4).
 * The log lives in student_colleges.engagement_log_json as an array of
 * { type, date, note } — validated here on every read and write.
 */

export const INTERVIEW_STATUSES = [
  { value: "not_offered", label: "Not offered", badge: "default" },
  { value: "to_schedule", label: "To schedule", badge: "warning" },
  { value: "scheduled", label: "Scheduled", badge: "primary" },
  { value: "completed", label: "Completed", badge: "success" },
] as const;

export const INTERVIEW_STATUS_VALUES = new Set<string>(
  INTERVIEW_STATUSES.map((s) => s.value)
);

export const INTERVIEW_STATUS_LABELS: Record<string, string> =
  Object.fromEntries(INTERVIEW_STATUSES.map((s) => [s.value, s.label]));

export const INTERVIEW_STATUS_BADGES: Record<string, string> =
  Object.fromEntries(INTERVIEW_STATUSES.map((s) => [s.value, s.badge]));

export const ENGAGEMENT_TYPES = [
  { value: "campus_visit", label: "Campus visit" },
  { value: "virtual_tour", label: "Virtual tour" },
  { value: "info_session", label: "Info session" },
  { value: "college_fair", label: "College fair" },
  { value: "rep_contact", label: "Rep contact / email" },
  { value: "interview", label: "Interview" },
  { value: "other", label: "Other" },
] as const;

export const ENGAGEMENT_TYPE_VALUES = new Set<string>(
  ENGAGEMENT_TYPES.map((t) => t.value)
);

export const ENGAGEMENT_TYPE_LABELS: Record<string, string> =
  Object.fromEntries(ENGAGEMENT_TYPES.map((t) => [t.value, t.label]));

export interface EngagementEntry {
  type: string;
  /** YYYY-MM-DD or null when unknown. */
  date: string | null;
  note: string | null;
}

/** Parse engagement_log_json defensively; junk entries are dropped. */
export function parseEngagementLog(value: unknown): EngagementEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (e): e is Record<string, unknown> => !!e && typeof e === "object"
    )
    .map((e) => ({
      type: ENGAGEMENT_TYPE_VALUES.has(String(e.type))
        ? String(e.type)
        : "other",
      date:
        typeof e.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.date)
          ? e.date
          : null,
      note:
        typeof e.note === "string" && e.note.trim() !== ""
          ? e.note.trim().slice(0, 500)
          : null,
    }))
    .slice(0, 100);
}
