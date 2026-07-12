import {
  getMeetings,
  getUpcomingMeetings,
  getUpcomingDeadlines,
  getStudentsForSelect,
  getStaffForSelect,
  getClientsByStudent,
} from "@/lib/db/queries";
import { CalendarClient, type CalendarView } from "./calendar-client";

interface Props {
  searchParams: Promise<{
    month?: string;
    year?: string;
    view?: string;
    date?: string;
  }>;
}

const VIEWS = new Set(["month", "week", "day", "agenda"]);

export default async function CalendarPage({ searchParams }: Props) {
  const params = await searchParams;
  const now = new Date();
  const view: CalendarView = VIEWS.has(params.view ?? "")
    ? (params.view as CalendarView)
    : "month";

  // Anchor date: explicit ?date, or legacy ?month/?year, or today.
  let anchor = now;
  if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    anchor = new Date(`${params.date}T12:00:00`);
  } else if (params.month || params.year) {
    anchor = new Date(
      params.year ? parseInt(params.year) : now.getFullYear(),
      params.month ? parseInt(params.month) : now.getMonth(),
      1,
      12
    );
  }
  const month = anchor.getMonth();
  const year = anchor.getFullYear();

  // Week and day views fetch their exact range (crossing month boundaries);
  // month + agenda keep the whole month.
  let range: { rangeStart: string; rangeEnd: string } | null = null;
  if (view === "week") {
    const start = new Date(anchor);
    start.setDate(anchor.getDate() - anchor.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    range = { rangeStart: start.toISOString(), rangeEnd: end.toISOString() };
  } else if (view === "day") {
    const start = new Date(anchor);
    start.setHours(0, 0, 0, 0);
    const end = new Date(anchor);
    end.setHours(23, 59, 59, 999);
    range = { rangeStart: start.toISOString(), rangeEnd: end.toISOString() };
  }

  const [meetings, upcoming, deadlines, students, staff, clientsByStudent] =
    await Promise.all([
      getMeetings(range ?? { month, year }),
      getUpcomingMeetings(8),
      getUpcomingDeadlines(8),
      getStudentsForSelect(),
      getStaffForSelect(),
      getClientsByStudent(),
    ]);

  return (
    <CalendarClient
      meetings={meetings}
      upcoming={upcoming}
      deadlines={deadlines}
      students={students}
      staff={staff}
      clientsByStudent={clientsByStudent}
      month={month}
      year={year}
      view={view}
      anchorDate={anchor.toISOString().slice(0, 10)}
    />
  );
}
