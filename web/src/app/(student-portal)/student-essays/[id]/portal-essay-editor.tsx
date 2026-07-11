"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { updateEssayDraft, submitEssayForReview } from "@/lib/actions/essays";

interface PortalEssay {
  id: string;
  title: string | null;
  essay_type: string;
  status: string;
  prompt_text: string | null;
  body: string;
  word_count_target: number | null;
  word_count_limit: number | null;
  current_version_number: number;
  visibility_scope: string;
  updated_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_review: "With your counselor",
  revision_requested: "Revision requested",
  approved: "Approved",
  final: "Final",
};

const STATUS_VARIANT: Record<
  string,
  "default" | "primary" | "warning" | "success"
> = {
  draft: "default",
  in_review: "primary",
  revision_requested: "warning",
  approved: "success",
  final: "success",
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Student-side essay editor: write, save (each save is a new version the
 * counselor can see), and hand the draft back for review. Locked once the
 * counselor approves/finalizes.
 */
export function PortalEssayEditor({ essay }: { essay: PortalEssay }) {
  const router = useRouter();
  const [body, setBody] = useState(essay.body);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [savedBody, setSavedBody] = useState(essay.body);
  const [prevBody, setPrevBody] = useState(essay.body);
  if (prevBody !== essay.body) {
    setPrevBody(essay.body);
    setSavedBody(essay.body);
  }
  const hasUnsaved = body !== savedBody;

  const locked =
    essay.status === "approved" ||
    essay.status === "final" ||
    !["student", "family"].includes(essay.visibility_scope);

  const wordCount = countWords(body);
  const limit = essay.word_count_limit ?? essay.word_count_target;

  function handleSave() {
    if (!hasUnsaved || locked) return;
    setError(null);
    startTransition(async () => {
      const result = await updateEssayDraft(essay.id, body);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setSavedBody(body);
      setSaveMessage("Saved");
      setTimeout(() => setSaveMessage(null), 3000);
      router.refresh();
    });
  }

  function handleSubmitForReview() {
    setError(null);
    startTransition(async () => {
      if (hasUnsaved) {
        const saved = await updateEssayDraft(essay.id, body);
        if ("error" in saved && saved.error) {
          setError(saved.error);
          return;
        }
        setSavedBody(body);
      }
      const result = await submitEssayForReview(essay.id);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <PageShell
      title={essay.title || "Essay"}
      description={`Version ${essay.current_version_number}`}
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/student-essays"
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            All essays
          </Link>
          {!locked && (
            <>
              <Button
                variant="outline"
                onClick={handleSave}
                disabled={isPending || !hasUnsaved}
              >
                {isPending ? "Saving..." : hasUnsaved ? "Save Draft" : "Saved"}
              </Button>
              <Button onClick={handleSubmitForReview} disabled={isPending}>
                Submit for review
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={STATUS_VARIANT[essay.status] ?? "default"}>
            {STATUS_LABELS[essay.status] ?? essay.status}
          </Badge>
          <span
            className={`text-sm ${
              limit && wordCount > limit
                ? "font-medium text-red-600"
                : "text-gray-500"
            }`}
          >
            {wordCount}
            {limit ? ` / ${limit}` : ""} words
          </span>
          {saveMessage && (
            <span className="text-sm text-success-600">{saveMessage}</span>
          )}
          {error && <span className="text-sm text-danger-500">{error}</span>}
        </div>

        {essay.prompt_text && (
          <Card>
            <CardContent>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Prompt
              </p>
              <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
                {essay.prompt_text}
              </p>
            </CardContent>
          </Card>
        )}

        {locked ? (
          <Card>
            <CardContent>
              {essay.status === "approved" || essay.status === "final" ? (
                <p className="mb-3 text-sm text-gray-500">
                  This essay has been finalized by your counselor and is now
                  read-only.
                </p>
              ) : null}
              <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
                {essay.body || "(empty)"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={20}
            placeholder="Start writing..."
            className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm leading-relaxed focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        )}
      </div>
    </PageShell>
  );
}
