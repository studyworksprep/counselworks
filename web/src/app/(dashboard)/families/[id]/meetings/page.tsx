import { notFound } from "next/navigation";
import {
  getMeetings,
  getFamilyByIdCached,
  getStaffForSelect,
  getClientsByStudent,
} from "@/lib/db/queries";
import type { FamilyStudentSummary } from "@/lib/db/queries";
import { MeetingsListClient } from "@/components/meetings/meetings-list-client";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Family Meetings (fix plan 13.0): every meeting for the household's
 * students — upcoming first, then history — with the calendar's own
 * schedule and detail/edit modals limited to those students.
 */
export default async function FamilyMeetingsPage({ params }: Props) {
  const { id } = await params;
  const now = new Date();
  const rangeStart = new Date(now.getFullYear() - 3, 0, 1).toISOString();
  const rangeEnd = new Date(now.getFullYear() + 3, 11, 31, 23, 59, 59).toISOString();
  const [family, meetings, staff, clientsByStudent] = await Promise.all([
    getFamilyByIdCached(id),
    getMeetings({ rangeStart, rangeEnd, familyId: id }),
    getStaffForSelect(),
    getClientsByStudent(),
  ]);
  if (!family) return notFound();

  const students = family.students.map((s: FamilyStudentSummary) => ({
    id: s.id,
    name: `${s.first_name} ${s.last_name}`,
  }));

  return (
    <MeetingsListClient
      students={students}
      defaultStudentId={students.length === 1 ? students[0].id : undefined}
      nowIso={now.toISOString()}
      meetings={meetings}
      staff={staff}
      clientsByStudent={clientsByStudent}
    />
  );
}
