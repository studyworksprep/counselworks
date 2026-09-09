import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { getTasksNeedingReview } from "@/lib/db/queries";
export default async function ReviewQueuePage() {
  const tasks = await getTasksNeedingReview();
  return <PageShell title="Needs review" description="Your submitted reviews and accessible plans needing attention">
    <ul className="divide-y rounded border bg-white p-4">{tasks.map(task => <li key={task.id} className="py-3">
      <Link className="font-medium underline" href={`/tasks/${task.id}`}>{task.title}</Link>
      <p className="text-sm text-gray-500">{task.needs_attention ? "Prerequisite reopened — check preserved work" : "Submitted for review"}</p>
    </li>)}</ul>{tasks.length === 0 && <p className="mt-4">No work is waiting for your review.</p>}
  </PageShell>;
}
