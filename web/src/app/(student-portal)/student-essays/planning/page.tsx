import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { EssayPlanningBoard } from "@/components/essays/essay-planning-board";
import { getEssayPlanningBoard, getInterviewStudents } from "@/lib/db/queries";

export default async function StudentEssayPlanningPage({ searchParams }: { searchParams: Promise<{ college?: string; essay?: string }> }) {
  const [students, filters] = await Promise.all([getInterviewStudents(), searchParams]);
  const data = students[0] ? await getEssayPlanningBoard(students[0].id) : null;
  if (!data || data.surface !== "student") return notFound();
  return <PageShell title="Essay planning board" description="Find the angle and experiences each response will add."><EssayPlanningBoard key={`${filters.college}:${filters.essay}`} data={data} initialCollege={filters.college} initialEssay={filters.essay} /></PageShell>;
}
