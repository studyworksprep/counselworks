import {
  getEssayDrafts,
  getStudentsForSelect,
  getEssayPrompts,
  getCollegesForSelect,
} from "@/lib/db/queries";
import { EssaysClient } from "./essays-client";

interface Props {
  searchParams: Promise<{
    search?: string;
    status?: string;
    essay_type?: string;
    student_id?: string;
  }>;
}

export default async function EssaysPage({ searchParams }: Props) {
  const params = await searchParams;
  const [essays, students, prompts, colleges] = await Promise.all([
    getEssayDrafts({
      search: params.search,
      status: params.status,
      essay_type: params.essay_type,
      student_id: params.student_id,
    }),
    getStudentsForSelect(),
    getEssayPrompts(),
    getCollegesForSelect(),
  ]);

  return (
    <EssaysClient
      essays={essays}
      students={students}
      prompts={prompts}
      colleges={colleges}
    />
  );
}
