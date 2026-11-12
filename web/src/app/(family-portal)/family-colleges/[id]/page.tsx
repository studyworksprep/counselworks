import { notFound } from "next/navigation";
import { getCollegeWorkspace } from "@/lib/db/queries";
import { CollegeWorkspace } from "@/components/colleges/college-workspace";

export default async function FamilyCollegeWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const data = await getCollegeWorkspace((await params).id);
  if (!data || data.surface !== "family") notFound();
  return <CollegeWorkspace data={data} />;
}
