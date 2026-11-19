import { ArrowLink } from "@/components/ui/arrow-link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { EssayPlanningBoard } from "@/components/essays/essay-planning-board";
import { getEssayPlanningBoard } from "@/lib/db/queries";

export default async function FamilyEssayPlanningPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ college?: string; essay?: string }> }) {
  const [{ id }, filters] = await Promise.all([params, searchParams]);
  const data = await getEssayPlanningBoard(id, filters.essay); if (!data || data.surface !== "family") return notFound();
  return <PageShell title={`Essay planning · ${data.student.name}`} description="The essays and planning material your family can see."><ArrowLink back className="mb-5" href="/family-essay-planning">Choose another student</ArrowLink><EssayPlanningBoard key={`${filters.college}:${filters.essay}`} data={data} initialCollege={filters.college} initialEssay={filters.essay} /></PageShell>;
}
