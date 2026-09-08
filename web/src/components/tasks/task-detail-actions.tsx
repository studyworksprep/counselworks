"use client";
import { useState, useTransition } from "react";
import { useWriteRefresh } from "@/lib/hooks/use-write-refresh";
import { Button } from "@/components/ui/button";
import { updateTaskStatus, linkTaskResource } from "@/lib/actions/tasks";
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
