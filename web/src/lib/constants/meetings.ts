/**
 * Meeting enums — the single spelling for every writer and label map
 * (calendar modals, the workspace meeting lists, portal self-booking).
 */
export const MEETING_TYPE_OPTIONS = [
  { value: "general", label: "General" },
  { value: "initial_consultation", label: "Initial Consultation" },
  { value: "strategy_session", label: "Strategy Session" },
  { value: "essay_review", label: "Essay Review" },
  { value: "parent_meeting", label: "Parent Meeting" },
  { value: "check_in", label: "Check-In" },
] as const;

/** Type stamped on meetings a family books from the portal (13.1). */
export const PORTAL_BOOKING_MEETING_TYPE = "general";

/** Where a meeting came from (meetings.booking_source). */
export const BOOKING_SOURCES = { staff: "staff", portal: "portal" } as const;
export type BookingSource = (typeof BOOKING_SOURCES)[keyof typeof BOOKING_SOURCES];

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const BOOKING_SLOT_MINUTES = [15, 30, 45, 60, 90] as const;
