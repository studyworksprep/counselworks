import { notFound } from "next/navigation";
import {
  getStudentById,
  getStudentColleges,
  getCollegesForSelect,
  getPerCollegeWorkflowTemplates,
  getAidComparison,
} from "@/lib/db/queries";
import { StudentCollegeListClient } from "./student-college-list-client";
import { NetCostComparison } from "@/components/aid/net-cost-comparison";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StudentCollegesPage({ params }: Props) {
  const { id } = await params;
  const [student, collegeList, allColleges, perCollegeTemplates, aidRows] =
    await Promise.all([
      getStudentById(id),
      getStudentColleges(id),
      getCollegesForSelect(),
      getPerCollegeWorkflowTemplates(),
      getAidComparison(id),
    ]);

  if (!student) return notFound();

  // Normalize Supabase join: colleges may come as object or array
  const normalized = collegeList.map((sc) => {
    const raw = sc as Record<string, unknown>;
    const colleges = raw.colleges;
    return {
      ...sc,
      colleges: Array.isArray(colleges) ? colleges[0] ?? null : colleges ?? null,
    };
  });

  return (
    <>
      <StudentCollegeListClient
        studentId={student.id}
        studentName={`${student.first_name} ${student.last_name}`}
        graduationYear={student.graduation_year}
        collegeList={normalized as Parameters<typeof StudentCollegeListClient>[0]["collegeList"]}
        allColleges={allColleges}
        perCollegeTemplates={perCollegeTemplates}
      />
      {aidRows.length > 0 && (
        <div className="px-4 pb-8 sm:px-8">
          <NetCostComparison rows={aidRows} linkBase="/applications" />
        </div>
      )}
    </>
  );
}
