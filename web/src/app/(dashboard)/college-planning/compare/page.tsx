import { redirect } from "next/navigation";
import { getCollegesForComparison } from "@/lib/db/queries";
import { CompareClient } from "./compare-client";

interface Props {
  searchParams: Promise<{ ids?: string }>;
}

export default async function CollegeComparePage({ searchParams }: Props) {
  const params = await searchParams;
  const ids = params.ids?.split(",").filter(Boolean) ?? [];

  if (ids.length < 2) {
    redirect("/college-planning/discover");
  }

  const colleges = await getCollegesForComparison(ids.slice(0, 4));

  if (colleges.length < 2) {
    redirect("/college-planning/discover");
  }

  return <CompareClient colleges={colleges} />;
}
