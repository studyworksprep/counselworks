import { getTaskOwnerChoices } from "@/lib/actions/tasks";
import { isStaffRole } from "@/lib/auth/resolve";
import { TASK_STATUS_LABELS } from "@/lib/constants/tasks";
import { DownloadButton } from "@/app/(student-portal)/student-documents/download-button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { OpenDocumentRequests } from "@/components/portal/open-document-requests";
import { getTaskDetail, getTaskResourceChoices } from "@/lib/db/queries";
import { formatDate } from "@/lib/utils";
import { taskPath, type TaskSurface } from "@/lib/constants/task-links";
import { TaskCompleteButton, TaskResourcePicker, TaskDeliverableActions, TaskCompletionSettings } from "./task-detail-actions";

export async function TaskDetail({ id, surface }: { id: string; surface: TaskSurface }) {
  const detail = await getTaskDetail(id);
  if (!detail || detail.surface !== surface) notFound();
  const { task, resource, request } = detail;
  const choices = detail.isStaff ? await getTaskResourceChoices(id) : [];
  const reviewers = detail.isStaff ? (await getTaskOwnerChoices(task.student_id)).choices.filter(c => c.ready && isStaffRole(c.role)) : [];
  const messagePath = surface === "staff" ? "/messages" : `/${surface}-messages`;
  return <PageShell title={task.title} description={detail.studentName ?? "Task"}>
    <div className="mx-auto max-w-3xl space-y-6 break-words [overflow-wrap:anywhere]">
      <Link className="text-sm underline" href={taskPath(id, surface).replace(`/${encodeURIComponent(id)}`, "")}>Back to tasks</Link>
      {task.owner_pending && <p role="status" className="rounded bg-warning-50 p-3">Awaiting owner resolution. This task is not published.</p>}
      <Card><CardContent>
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-gray-500">Responsible person</dt><dd>{detail.ownerName}</dd></div>
          <div><dt className="text-gray-500">Status</dt><dd>{TASK_STATUS_LABELS[task.status] || task.status}</dd></div>
          <div><dt className="text-gray-500">Due date</dt><dd>{task.due_at ? formatDate(task.due_on || task.due_at) : "No due date"}{task.due_on && ` · End of day (${task.due_timezone})`}</dd></div>
          <div><dt className="text-gray-500">Priority</dt><dd>{task.priority}</dd></div>
          {detail.application && <div><dt className="text-gray-500">College / application</dt><dd><Link className="underline" href={detail.application.href}>{detail.application.title}</Link></dd></div>}
          {detail.workflowName && <div><dt className="text-gray-500">Plan</dt><dd>{detail.workflowName}</dd></div>}
          {task.completion_mode === "review_required" && <div><dt className="text-gray-500">Reviewer</dt><dd>{detail.reviewerName}</dd></div>}
        </dl>
        <h2 className="mt-6 font-semibold">Instructions</h2>
        <p className="mt-2 whitespace-pre-wrap text-gray-700">{task.description || "No additional instructions."}</p>
      </CardContent></Card>
      <Card><CardContent>
        <h2 className="mb-3 font-semibold">Next action</h2>
        {detail.nextActions.map((next,index)=><p className="mb-3 text-sm" key={index}>{next.href ? <Link className="underline" href={next.href}>{next.title}</Link> : next.title} — {next.owner}</p>)}
        {resource && <div className="mb-4"><p className="mb-2 text-sm">{resource.title}</p>{resource.kind === "document" ? <DownloadButton documentId={resource.id} /> : <Link className="inline-block rounded bg-primary-600 px-4 py-2 text-white" href={resource.href}>{resource.action}</Link>}</div>}
        {!resource && detail.hasLinkedWork && <p className="mb-3 text-sm">Linked work is unavailable to your account. Ask your counselor for help.</p>}
        {request?.status === "requested" && !detail.isStaff && <div className="mb-4"><OpenDocumentRequests requests={[request]} taskId={id} /></div>}
        {request?.status === "fulfilled" && <p className="mb-4 text-sm">The requested document has been uploaded.</p>}
        {task.status === "completed" ? <p>Complete.</p> : task.status === "submitted" ? <p>Submitted for review.</p> : detail.canComplete ? <TaskCompleteButton key={id} id={id} /> : <p className="text-sm">{task.owner_pending ? "Your counselor must resolve the owner before work can begin." : detail.isMine ? "Complete the linked work, then submit it here." : `Waiting on ${detail.ownerName}. You can follow progress here.`}</p>}
        {task.review_feedback && resource && <p className="my-3 whitespace-pre-wrap text-sm">Feedback: {task.review_feedback}</p>}
        {detail.submittedEssay && <details className="my-4"><summary className="cursor-pointer font-medium">Submitted essay — version {detail.submittedEssay.version_number}</summary><p className="mt-2 whitespace-pre-wrap">{detail.submittedEssay.body}</p></details>}
        {detail.submittedDocument && <div className="my-4"><p className="text-sm">Submitted document: {detail.submittedDocument.title}</p><DownloadButton documentId={detail.submittedDocument.id} /></div>}
        <TaskDeliverableActions id={id} status={task.status} mode={task.completion_mode} canAct={detail.isMine || detail.isStaff}
          canReview={detail.canReview} blocked={task.dependency_blocked} attention={task.needs_attention}
          expected={task.submitted_version_id || task.submitted_document_id} />
        <Link className="mt-4 inline-block text-sm underline" href={`${messagePath}?task=${encodeURIComponent(id)}`}>Ask about this task</Link>
      </CardContent></Card>
      {detail.isStaff && <Card><CardContent><TaskResourcePicker key={id} taskId={id} choices={choices}
        selected={task.related_entity_type && task.related_entity_id ? `${task.related_entity_type}:${task.related_entity_id}` : task.application_id ? `application:${task.application_id}` : ""} />{<TaskCompletionSettings id={id} mode={task.completion_mode} reviewer={task.reviewer_user_id} reviewers={reviewers} started={task.status !== "pending" || !!task.submitted_version_id || !!task.submitted_document_id} />}</CardContent></Card>}
    </div>
  </PageShell>;
}
