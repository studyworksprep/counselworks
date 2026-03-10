import { getCollegePlanningList } from "@/lib/db/queries";
import { CollegePlanningClient } from "./college-planning-client";

interface Props {
  searchParams: Promise<{ search?: string; category?: string }>;
}

export default async function CollegePlanningPage({ searchParams }: Props) {
  const params = await searchParams;
  const list = await getCollegePlanningList({
    search: params.search,
    category: params.category,
  });

  return <CollegePlanningClient list={list} />;
}
