"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { updateEssayDraft, submitEssayForReview } from "@/lib/actions/essays";
import { useUnsavedChangesWarning } from "@/lib/hooks/use-unsaved-changes-warning";
import {
  ESSAY_STATUS_PORTAL_LABELS,
  ESSAY_STATUS_BADGES,
  resolveWordLimit,
} from "@/lib/constants/essays";
import {
  FeedbackPanel,
  type SelectionAnchor,
} from "@/components/essays/feedback-panel";
import type { EssayFeedbackRow } from "@/lib/db/queries";

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

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Student-side essay editor: write, save (each save is a new version the
 * counselor can see), and hand the draft back for review. Locked once the
 * counselor approves/finalizes.
 */
export function PortalEssayEditor({
  essay,
  feedback = [],
}: {
  essay: PortalEssay;
  feedback?: EssayFeedbackRow[];
}) {
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
  useUnsavedChangesWarning(hasUnsaved);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const locked =
    essay.status === "approved" ||
    essay.status === "final" ||
    !["student", "family"].includes(essay.visibility_scope);

  const wordCount = countWords(body);
  // One limit rule shared with the staff editor (fix plan 7.7).
  const limit = resolveWordLimit(essay);

  // Autosave (fix plan 10.3): same rule as the staff editor.
  useEffect(() => {
    if (!hasUnsaved || locked) return;
    const t = setTimeout(async () => {
      const result = await updateEssayDraft(essay.id, body, undefined, {
        autosave: true,
      });
      if (!("error" in result && result.error)) {
        setSavedBody(body);
        setSaveMessage("Autosaved");
        setTimeout(() => setSaveMessage(null), 2000);
      }
    }, 15000);
    return () => clearTimeout(t);
  }, [body, hasUnsaved, locked, essay.id]);

  function getTextareaSelection(): SelectionAnchor | null {
    const ta = textareaRef.current;
    if (!ta) return null;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (start === end) return null;
    return {
      quotedText: body.slice(start, end),
      anchorStart: start,
      anchorEnd: end,
    };
  }

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
          <Badge variant={ESSAY_STATUS_BADGES[essay.status] ?? "default"}>
            {ESSAY_STATUS_PORTAL_LABELS[essay.status] ?? essay.status}
          </Badge>
          <span
            className={`text-sm ${
              limit && wordCount > limit
                ? "font-medium text-danger-600"
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
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={20}
            placeholder="Start writing..."
            className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm leading-relaxed focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        )}

        <FeedbackPanel
          essayId={essay.id}
          feedback={feedback}
          getSelection={locked ? undefined : getTextareaSelection}
          readOnly={locked}
        />
      </div>
    </PageShell>
  );
}
