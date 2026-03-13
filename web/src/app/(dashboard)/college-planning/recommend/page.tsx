import { getCollegeRecommendations, getStudentsForSelect } from "@/lib/db/queries";
import { RecommendClient } from "./recommend-client";

interface Props {
  searchParams: Promise<{ student_id?: string }>;
}

export default async function RecommendPage({ searchParams }: Props) {
  const params = await searchParams;
  const students = await getStudentsForSelect();

  let result = null;
  if (params.student_id) {
    result = await getCollegeRecommendations(params.student_id);
  }

  return (
    <RecommendClient
      students={students}
      selectedStudentId={params.student_id ?? null}
      studentData={result?.student ?? null}
      recommendations={result?.recommendations ?? []}
    />
  );
}
