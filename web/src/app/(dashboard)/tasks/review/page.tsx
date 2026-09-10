import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { getReviewQueueState } from "@/lib/tasks/review-queue";
export default async function ReviewQueuePage() {
  const queue = await getReviewQueueState();
  const tasks = queue.tasks;
  return <PageShell title="Needs review" description="Your submitted reviews and accessible plans needing attention">
    {!queue.available && <p role="alert" className="my-4 text-danger-700">The review queue is temporarily unavailable. <Link href="/tasks/review" className="underline">Try again</Link> or <Link href="/dashboard" className="underline">return to the dashboard</Link>.</p>}
    <ul className="divide-y rounded border bg-white p-4">{tasks.map(task => <li key={task.id} className="py-3">
      <Link className="font-medium underline" href={`/tasks/${task.id}`}>{task.title}</Link>
      <p className="text-sm text-gray-500">{task.needs_attention ? "Prerequisite reopened — check preserved work" : "Submitted for review"}</p>
    </li>)}</ul>{queue.available && tasks.length === 0 && <p className="mt-4">No work is waiting for your review.</p>}
  </PageShell>;
}
