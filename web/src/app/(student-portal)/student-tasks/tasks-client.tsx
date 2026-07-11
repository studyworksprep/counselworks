"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  createStudentPortalTask,
  updateTaskStatus,
} from "@/lib/actions/tasks";

export function StudentTaskActions({
  taskId,
  status,
}: {
  taskId: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();

  function toggleComplete() {
    startTransition(async () => {
      const newStatus = status === "completed" ? "pending" : "completed";
      await updateTaskStatus(taskId, newStatus);
    });
  }

  const isComplete = status === "completed";

  return (
    <button
      onClick={toggleComplete}
      disabled={isPending}
      className="h-5 w-5 shrink-0 rounded border-2 border-gray-300 hover:border-primary-500 transition-colors disabled:opacity-50 flex items-center justify-center"
      aria-label={isComplete ? "Mark incomplete" : "Mark complete"}
    >
      {isPending && (
        <svg className="h-3 w-3 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
    </button>
  );
}

export function AddPersonalTaskForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createStudentPortalTask(formData);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-2"
    >
      <div className="flex-1 min-w-48">
        <label className="mb-1 block text-xs font-medium text-gray-500">
          Add a personal task
        </label>
        <input
          name="title"
          required
          placeholder="e.g. Draft UChicago supplement outline"
          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>
      <input
        name="due_at"
        type="date"
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
      <Button type="submit" size="sm" loading={isPending}>
        Add
      </Button>
      {error && <p className="w-full text-xs text-danger-500">{error}</p>}
    </form>
  );
}
