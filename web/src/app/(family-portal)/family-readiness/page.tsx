import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { getInterviewStudents } from "@/lib/db/queries";

export default async function FamilyReadinessIndex() {
  const students = await getInterviewStudents();
  return (
    <PageShell
      title="Application readiness"
      description="Choose a student to see their shared application work."
    >
      <div className="space-y-4">
        {students.map((student) => (
          <Link
            key={student.id}
            href={`/family-readiness/${student.id}`}
            className="block rounded-xl border border-gray-200 bg-white p-5 text-primary-700 hover:bg-primary-50"
          >
            <span className="font-semibold">
              {student.first_name} {student.last_name}
            </span>
            <span className="mt-1 block text-sm text-gray-600">
              Deadlines, checklist items and work shared with your family
            </span>
          </Link>
        ))}
        {!students.length && (
          <p className="text-sm text-gray-500">
            No student is linked to this account yet.
          </p>
        )}
      </div>
    </PageShell>
  );
}
