import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { getInterviewStudents } from "@/lib/db/queries";

export default async function FamilyEssayPlanningIndex() {
  const students = await getInterviewStudents();
  return <PageShell title="Essay planning" description="Choose a student to see their family-shared writing plans."><div className="space-y-4">{students.map(student => <Link key={student.id} href={`/family-essay-planning/${student.id}`} className="block rounded-xl border border-gray-200 bg-white p-5 text-primary-700 hover:bg-primary-50"><span className="font-semibold">{student.first_name} {student.last_name}</span><span className="mt-1 block text-sm text-gray-600">Shared essays, approved planning notes, stories and narratives</span></Link>)}{!students.length && <p className="text-sm text-gray-500">No student is linked to this account yet.</p>}</div></PageShell>;
}
