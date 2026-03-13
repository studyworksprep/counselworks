import { notFound } from "next/navigation";
import { getCollegeDetail, getCollegeFitAnalysis, getCollegeResearchNotes } from "@/lib/db/queries";
import { CollegeDetailClient } from "./college-detail-client";

interface Props {
  params: Promise<{ collegeId: string }>;
}

export default async function CollegeDetailPage({ params }: Props) {
  const { collegeId } = await params;

  const [college, fitAnalysis, researchNotes] = await Promise.all([
    getCollegeDetail(collegeId),
    getCollegeFitAnalysis(collegeId),
    getCollegeResearchNotes(collegeId),
  ]);

  if (!college) notFound();

  return (
    <CollegeDetailClient
      college={college}
      fitStudents={fitAnalysis.students.filter((s): s is NonNullable<typeof s> => s !== null)}
      researchNotes={researchNotes}
    />
  );
}
