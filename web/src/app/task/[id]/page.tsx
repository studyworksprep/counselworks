import { redirect, notFound } from "next/navigation";
import { getTaskDetail } from "@/lib/db/queries";
import { taskPath } from "@/lib/constants/task-links";
export default async function TaskRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getTaskDetail(id);
  if (!detail) notFound();
  redirect(taskPath(id, detail.surface));
}
