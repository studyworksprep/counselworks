import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import {
  getBookableCounselorsForFamily,
  getBookingSlots,
} from "@/lib/db/queries";
import { BookingClient } from "./booking-client";

interface Props {
  searchParams: Promise<{ student?: string; staff?: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Family portal → Book a Meeting (fix plan 13.1). The parent picks a child
 * and one of that child's assigned counselors who has published
 * availability; open slots are computed server-side from the counselor's
 * windows minus their existing meetings and shown in the parent's own
 * timezone. Selection lives in the URL so the page is a plain server
 * render and back/forward work.
 */
export default async function FamilyBookingPage({ searchParams }: Props) {
  const params = await searchParams;
  const data = await getBookableCounselorsForFamily();
  if (!data) redirect("/sign-in");

  const { students, counselorsByStudent } = data;
  const bookableStudents = students.filter(
    (s) => (counselorsByStudent[s.id] ?? []).length > 0
  );

  // Default the selection when there is only one sensible choice.
  const requestedStudent = params.student && UUID_RE.test(params.student) ? params.student : null;
  const studentId =
    requestedStudent && bookableStudents.some((s) => s.id === requestedStudent)
      ? requestedStudent
      : bookableStudents.length === 1
        ? bookableStudents[0].id
        : null;
  const counselors = studentId ? (counselorsByStudent[studentId] ?? []) : [];
  const requestedStaff = params.staff && UUID_RE.test(params.staff) ? params.staff : null;
  const staffUserId =
    requestedStaff && counselors.some((c) => c.user_id === requestedStaff)
      ? requestedStaff
      : counselors.length === 1
        ? counselors[0].user_id
        : null;

  const availability =
    studentId && staffUserId ? await getBookingSlots({ studentId, staffUserId }) : null;

  return (
    <PageShell
      title="Book a Meeting"
      description="Pick an open time with your counselor"
    >
      {bookableStudents.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-gray-600">
              Your counselor hasn&apos;t opened online booking yet. Send them
              a message to set up a time.
            </p>
          </CardContent>
        </Card>
      ) : (
        <BookingClient
          students={bookableStudents}
          counselorsByStudent={counselorsByStudent}
          studentId={studentId}
          staffUserId={staffUserId}
          slots={availability?.slots ?? []}
          slotMinutes={availability?.rules.slot_minutes ?? null}
          counselorName={availability?.counselorName ?? null}
          studentHasPortal={!!availability?.student.user_id}
        />
      )}
    </PageShell>
  );
}
