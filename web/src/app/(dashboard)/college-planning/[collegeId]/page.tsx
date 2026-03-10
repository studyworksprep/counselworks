import { notFound } from "next/navigation";
import { getCollegeDetail } from "@/lib/db/queries";
import { CollegeDetailClient } from "./college-detail-client";

interface Props {
  params: Promise<{ collegeId: string }>;
}

export default async function CollegeDetailPage({ params }: Props) {
  const { collegeId } = await params;
  const college = await getCollegeDetail(collegeId);

  if (!college) notFound();

  return <CollegeDetailClient college={college} />;
}
