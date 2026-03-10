import {
  getCollegePlanningList,
  getStudentsForSelect,
  getCollegesForSelect,
} from "@/lib/db/queries";
import { CollegePlanningClient } from "./college-planning-client";

interface Props {
  searchParams: Promise<{ search?: string; category?: string }>;
}

export default async function CollegePlanningPage({ searchParams }: Props) {
  const params = await searchParams;
  const [list, students, colleges] = await Promise.all([
    getCollegePlanningList({
      search: params.search,
      category: params.category,
    }),
    getStudentsForSelect(),
    getCollegesForSelect(),
  ]);

  return (
    <CollegePlanningClient
      list={list}
      students={students}
      colleges={colleges}
    />
  );
}
