import { getStudents } from "@/lib/db/queries";
import { StudentsClient } from "./students-client";

interface Props {
  searchParams: Promise<{ search?: string; status?: string; year?: string }>;
}

export default async function StudentsPage({ searchParams }: Props) {
  const params = await searchParams;
  const students = await getStudents({
    search: params.search,
    status: params.status,
    graduationYear: params.year,
  });

  return <StudentsClient students={students} />;
}
