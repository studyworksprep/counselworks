"use client";

import { useTransition } from "react";
import { updateTaskStatus } from "@/lib/actions/tasks";

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
