import { getApplications, getStudentsForSelect } from "@/lib/db/queries";
import { ApplicationsClient } from "./applications-client";

interface Props {
  searchParams: Promise<{
    search?: string;
    stage?: string;
    student_id?: string;
    round?: string;
    due?: string;
  }>;
}

export default async function ApplicationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const [applications, students] = await Promise.all([
    getApplications({
      search: params.search,
      stage: params.stage,
      studentId: params.student_id,
      round: params.round,
      due: params.due,
    }),
    getStudentsForSelect(),
  ]);

  return <ApplicationsClient applications={applications} students={students} />;
}
