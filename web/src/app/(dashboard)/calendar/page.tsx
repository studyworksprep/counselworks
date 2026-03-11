import {
  getMeetings,
  getUpcomingMeetings,
  getUpcomingDeadlines,
  getStudentsForSelect,
  getStaffForSelect,
} from "@/lib/db/queries";
import { CalendarClient } from "./calendar-client";

interface Props {
  searchParams: Promise<{ month?: string; year?: string }>;
}

export default async function CalendarPage({ searchParams }: Props) {
  const params = await searchParams;
  const now = new Date();
  const month = params.month ? parseInt(params.month) : now.getMonth();
  const year = params.year ? parseInt(params.year) : now.getFullYear();

  const [meetings, upcoming, deadlines, students, staff] = await Promise.all([
    getMeetings({ month, year }),
    getUpcomingMeetings(8),
    getUpcomingDeadlines(8),
    getStudentsForSelect(),
    getStaffForSelect(),
  ]);

  return (
    <CalendarClient
      meetings={meetings}
      upcoming={upcoming}
      deadlines={deadlines}
      students={students}
      staff={staff}
      month={month}
      year={year}
    />
  );
}
