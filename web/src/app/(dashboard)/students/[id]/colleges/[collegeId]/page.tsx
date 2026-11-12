import { notFound } from "next/navigation";
import { getCollegeWorkspace } from "@/lib/db/queries";
import { CollegeWorkspace } from "@/components/colleges/college-workspace";

export default async function StudentCollegeWorkspacePage({ params }: { params: Promise<{ id: string; collegeId: string }> }) {
  const { id, collegeId } = await params;
  const data = await getCollegeWorkspace(collegeId);
  if (!data || data.surface !== "staff" || data.student.id !== id) notFound();
  return <CollegeWorkspace data={data} />;
}
