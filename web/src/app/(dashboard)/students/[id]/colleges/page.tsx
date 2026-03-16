import { notFound } from "next/navigation";
import { getStudentById, getStudentColleges, getCollegesForSelect } from "@/lib/db/queries";
import { StudentCollegeListClient } from "./student-college-list-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function StudentCollegesPage({ params }: Props) {
  const { id } = await params;
  const [student, collegeList, allColleges] = await Promise.all([
    getStudentById(id),
    getStudentColleges(id),
    getCollegesForSelect(),
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
    <StudentCollegeListClient
      studentId={student.id}
      studentName={`${student.first_name} ${student.last_name}`}
      graduationYear={student.graduation_year}
      collegeList={normalized as Parameters<typeof StudentCollegeListClient>[0]["collegeList"]}
      allColleges={allColleges}
    />
  );
}
