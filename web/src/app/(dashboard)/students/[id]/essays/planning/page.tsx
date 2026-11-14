import { notFound } from "next/navigation";
import { getEssayPlanningBoard } from "@/lib/db/queries";
import { EssayPlanningBoard } from "@/components/essays/essay-planning-board";

export default async function StaffEssayPlanningPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ college?: string; essay?: string }> }) {
  const [{ id }, filters] = await Promise.all([params, searchParams]);
  const data = await getEssayPlanningBoard(id); if (!data || data.surface !== "staff") return notFound();
  return <div className="space-y-6"><div><h1 className="text-2xl font-semibold">Essay planning board</h1><p className="mt-1 text-sm text-gray-600">Connect application prompts, response angles, stories and narratives.</p></div><EssayPlanningBoard key={`${filters.college}:${filters.essay}`} data={data} initialCollege={filters.college} initialEssay={filters.essay} /></div>;
}
