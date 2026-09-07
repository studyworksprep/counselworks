import { notFound } from "next/navigation";
import {
  getEssayDrafts,
  getStudentByIdCached,
  getEssayPrompts,
  getCollegesForSelect,
} from "@/lib/db/queries";
import { EssaysClient } from "@/app/(dashboard)/essays/essays-client";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ search?: string; status?: string; essay_type?: string }>;
}

/**
 * Student Essays (fix plan 13.0): the firm-wide Essays list pinned to this
 * student. New drafts default to them.
 */
export default async function StudentEssaysPage({ params, searchParams }: Props) {
  const [{ id }, filters] = await Promise.all([params, searchParams]);
  const [student, essays, prompts, colleges] = await Promise.all([
    getStudentByIdCached(id),
    getEssayDrafts({
      search: filters.search,
      status: filters.status,
      essay_type: filters.essay_type,
      student_id: id,
    }),
    getEssayPrompts(),
    getCollegesForSelect(),
  ]);
  if (!student) return notFound();

  return (
    <EssaysClient
      essays={essays}
      students={[
        { id, name: `${student.first_name} ${student.last_name}` },
      ]}
      prompts={prompts}
      colleges={colleges}
      embed={{ studentId: id, basePath: `/students/${id}/essays` }}
    />
  );
}
