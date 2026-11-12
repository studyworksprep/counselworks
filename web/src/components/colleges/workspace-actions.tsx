"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { assignCollegePrompts } from "@/lib/actions/college-prompts";
import { createApplicationFromList } from "@/lib/actions/applications";
import { useWriteRefresh } from "@/lib/hooks/use-write-refresh";

export function CollegeWorkspaceAction({ collegeId, kind, promptId, label }: {
  collegeId: string;
  kind: "application" | "required" | "prompt";
  promptId?: string;
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const commit = useWriteRefresh();
  function run() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = kind === "application" ? await createApplicationFromList(collegeId)
          : await assignCollegePrompts(collegeId, kind === "prompt" ? promptId ?? null : null);
        if ("error" in result) { setError(result.error ?? "Unable to save"); return; }
        setMessage("assigned" in result ? `${result.assigned} new assignments. Existing writing preserved.` : "Application ready.");
        commit();
      } catch {
        setError("Unable to save. Please try again.");
      }
    });
  }
  return <div>
    <Button size="sm" variant="outline" onClick={run} disabled={pending}>{pending ? "Saving…" : label}</Button>
    {message && <p role="status" className="mt-2 text-sm text-success-700">{message}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-danger-600">{error}</p>}
  </div>;
}
