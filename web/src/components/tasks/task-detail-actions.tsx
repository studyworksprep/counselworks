"use client";
import { useState, useTransition } from "react";
import { useWriteRefresh } from "@/lib/hooks/use-write-refresh";
import { Button } from "@/components/ui/button";
import { TASK_COMPLETION_MODES } from "@/lib/constants/tasks";
import { updateTaskStatus, linkTaskResource, actOnTaskDeliverable, configureTaskCompletion } from "@/lib/actions/tasks";
import type { TaskResourceLink } from "@/lib/constants/task-links";

export function TaskCompleteButton({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const commitWrite = useWriteRefresh();
  return <div><Button loading={pending} onClick={() => start(async () => {
    const result = await updateTaskStatus(id, "completed");
    setError(result.error ?? null);
    if (!result.error) commitWrite();
  })}>Mark complete</Button>{error && <p role="alert" className="mt-2 text-sm text-danger-600">{error}</p>}</div>;
}

export function TaskResourcePicker({ taskId, choices, selected }: { taskId: string; choices: TaskResourceLink[]; selected: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const commitWrite = useWriteRefresh();
  return <form className="space-y-3" onSubmit={event => {
    event.preventDefault(); const formData = new FormData(event.currentTarget);
    start(async () => { const result = await linkTaskResource(taskId, formData); setError(result.error ?? null); if (!result.error) commitWrite(); });
  }}>
    <label className="block text-sm font-medium">Linked work
      <select name="resource" defaultValue={selected} className="mt-1 block w-full max-w-full rounded border p-2">
        <option value="">No linked work</option>
        {selected && !choices.some(c => `${c.kind}:${c.id}` === selected) && <option value={selected}>Existing link unavailable — choose a replacement</option>}
        {choices.map(c => <option key={`${c.kind}:${c.id}`} value={`${c.kind}:${c.id}`}>{c.kind.replaceAll("_", " ")}: {c.title}</option>)}
      </select>
    </label>
    <p className="text-xs text-gray-500">Sharing a task does not change access to its linked work.</p>
    <Button type="submit" loading={pending} size="sm">Save linked work</Button>
    {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
  </form>;
}

export function TaskDeliverableActions({ id, status, mode, canAct, canReview, blocked, attention, canRetry, expected }: {
  id: string; status: string; mode: string; canAct: boolean; canReview: boolean;
  blocked: boolean; attention: boolean; canRetry: boolean; expected: string | null;
}) {
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const commitWrite = useWriteRefresh();
  function act(action: string) {
    start(async () => {
      const result = await actOnTaskDeliverable(id, action, expected, feedback);
      setError(result.error ?? null);
      commitWrite();
    });
  }
  return <div className="space-y-3">
    {blocked && <p role="status">Waiting for a prerequisite. Your saved work is preserved.</p>}
    {attention && <p role="status">A prerequisite was reopened. Your counselor must check and reopen this affected work.</p>}
    {canAct && !blocked && !attention && mode !== "simple" && ["pending", "in_progress", "changes_requested"].includes(status) &&
      <Button loading={pending} onClick={() => act("submit")}>{mode === "review_required" ? "Submit for review" : "Submit evidence"}</Button>}
    {canReview && status === "submitted" && !blocked && !attention && <div className="space-y-2">
      <label className="block text-sm">Review feedback (required for changes)
        <textarea value={feedback} onChange={e => setFeedback(e.target.value)} className="mt-1 block w-full rounded border p-2" />
      </label>
      <div className="flex flex-wrap gap-2"><Button loading={pending} onClick={() => act("approved")}>Approve submission</Button>
        <Button loading={pending} variant="outline" onClick={() => act("changes_requested")}>Request changes</Button></div>
    </div>}
    {canAct && (status === "completed" || attention) && <Button variant="outline" loading={pending} onClick={() => act("reopen")}>Reopen task</Button>}
    {canRetry && <Button variant="outline" size="sm" loading={pending} onClick={() => act("retry")}>Retry workflow</Button>}
    {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
  </div>;
}

export function TaskCompletionSettings({ id, mode, reviewer, reviewers, started }: {
  id: string; mode: string; reviewer: string | null; started: boolean; reviewers: { id: string; name: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const commitWrite = useWriteRefresh();
  return <form className="mt-6 space-y-3" onSubmit={e => {
    e.preventDefault(); const form = new FormData(e.currentTarget);
    start(async () => { const result = await configureTaskCompletion(id, form); setError(result.error ?? null); if (!result.error) commitWrite(); });
  }}>
    <label className="block text-sm font-medium">Completion requirement
      {started && <input type="hidden" name="completion_mode" value={mode} />}
      <select name="completion_mode" disabled={started} defaultValue={mode} className="mt-1 block w-full rounded border p-2">
        {TASK_COMPLETION_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
    </label>
    <label htmlFor={`task-reviewer-${id}`} className="block text-sm font-medium">Reviewer</label>
      <select id={`task-reviewer-${id}`} name="reviewer_user_id" defaultValue={reviewer || ""} className="mt-1 block w-full rounded border p-2">
        <option value="">Choose reviewer</option>{reviewers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
    <Button loading={pending} size="sm">Save completion requirement</Button>
    {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
  </form>;
}
