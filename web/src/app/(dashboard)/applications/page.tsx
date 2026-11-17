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
    // No stage filter here: the client filters by stage so the pipeline
    // strip can count every stage within the other filters.
    getApplications({
      search: params.search,
      studentId: params.student_id,
      round: params.round,
      due: params.due,
    }),
    getStudentsForSelect(),
  ]);

  return <ApplicationsClient applications={applications} students={students} />;
}
