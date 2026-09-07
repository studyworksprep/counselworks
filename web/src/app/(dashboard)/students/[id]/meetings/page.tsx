import { notFound } from "next/navigation";
import {
  getMeetings,
  getStudentByIdCached,
  getStaffForSelect,
  getClientsByStudent,
} from "@/lib/db/queries";
import { StudentMeetingsClient } from "./student-meetings-client";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Student Meetings (fix plan 13.0): every meeting for this student —
 * upcoming first, then history — with the calendar's own schedule and
 * detail/edit modals, pre-set to the student. The calendar remains the
 * place to see the week across students.
 */
export default async function StudentMeetingsPage({ params }: Props) {
  const { id } = await params;
  const now = new Date();
  const rangeStart = new Date(now.getFullYear() - 3, 0, 1).toISOString();
  const rangeEnd = new Date(now.getFullYear() + 3, 11, 31, 23, 59, 59).toISOString();
  const [student, meetings, staff, clientsByStudent] = await Promise.all([
    getStudentByIdCached(id),
    getMeetings({ rangeStart, rangeEnd, studentId: id }),
    getStaffForSelect(),
    getClientsByStudent(),
  ]);
  if (!student) return notFound();

  return (
    <StudentMeetingsClient
      studentId={id}
      studentName={`${student.first_name} ${student.last_name}`}
      nowIso={new Date().toISOString()}
      meetings={meetings}
      staff={staff}
      clientsByStudent={clientsByStudent}
    />
  );
}
