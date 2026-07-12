import { getStudentsForSelect, getCollegesForSelect } from "@/lib/db/queries";
import { NewApplicationForm } from "./new-application-form";

interface Props {
  searchParams: Promise<{ student_id?: string; college_id?: string }>;
}

// student_id / college_id query params pre-fill the form (fix plan 8.6) so
// the board and college-list entry points don't force re-entering both.
export default async function NewApplicationPage({ searchParams }: Props) {
  const params = await searchParams;
  const [students, colleges] = await Promise.all([
    getStudentsForSelect(),
    getCollegesForSelect(),
  ]);

  return (
    <NewApplicationForm
      students={students}
      colleges={colleges}
      initialStudentId={params.student_id ?? null}
      initialCollegeId={params.college_id ?? null}
    />
  );
}
