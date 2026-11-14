import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { EssayPlanningBoard } from "@/components/essays/essay-planning-board";
import { getEssayPlanningBoard } from "@/lib/db/queries";

export default async function FamilyEssayPlanningPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ college?: string; essay?: string }> }) {
  const [{ id }, filters] = await Promise.all([params, searchParams]);
  const data = await getEssayPlanningBoard(id); if (!data || data.surface !== "family") return notFound();
  return <PageShell title={`Essay planning · ${data.student.name}`} description="The essays and planning material your family can see."><Link href="/family-essay-planning" className="mb-5 inline-block text-sm text-primary-700 underline">Choose another student</Link><EssayPlanningBoard key={`${filters.college}:${filters.essay}`} data={data} initialCollege={filters.college} initialEssay={filters.essay} /></PageShell>;
}
