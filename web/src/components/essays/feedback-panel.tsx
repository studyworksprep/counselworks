"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatDate } from "@/lib/utils";
import { addEssayFeedback, resolveEssayFeedback } from "@/lib/actions/essays";
import type { EssayFeedbackRow } from "@/lib/db/queries";
import type { RevisionTask } from "@/lib/essays/drafting";
import type { TaskSurface } from "@/lib/constants/task-links";
import { EssayRevisionTask } from "./essay-revision-task";
import { XMarkIcon } from "@/components/icons";

export interface SelectionAnchor {
  quotedText: string;
  anchorStart: number;
  anchorEnd: number;
}

function CommentItem({
  f,
  readOnly,
  isPending,
  handleResolve,
  revisionTasks,
  canAssignRevisions,
  surface,
  onTaskEditorChange,
}: {
  f: EssayFeedbackRow;
  readOnly: boolean;
  isPending: boolean;
  handleResolve: (id: string) => void;
  revisionTasks: RevisionTask[];
  canAssignRevisions: boolean;
  surface: TaskSurface;
  onTaskEditorChange: (id: string | null) => void;
}) {
  return (
    <li
      id={`feedback-${f.id}`}
      tabIndex={-1}
      className="scroll-mt-8 border-b border-gray-50 pb-2 last:border-0"
    >
      <p className="text-xs text-gray-500">
        <span
          className={
            f.author_is_staff
              ? "font-medium text-primary-700"
              : "font-medium text-gray-700"
          }
        >
          {f.author_name}
        </span>{" "}
        · v{f.version_number} · {formatDate(f.created_at)}
        {f.resolved_at && " · Resolved"}
      </p>
      {f.quoted_text && (
        <blockquote className="mt-1 border-l-2 border-primary-200 bg-primary-50/50 px-2 py-1 text-xs italic text-gray-600">
          “
          {f.quoted_text.length > 160
            ? `${f.quoted_text.slice(0, 160)}…`
            : f.quoted_text}
          ”
        </blockquote>
      )}
      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{f.body}</p>
      {f.ai_provenance && (
        <div
          className="mt-2 space-y-1 text-xs"
          aria-label="Reviewed coaching citations"
        >
          <p>
            AI-assisted feedback · reviewed before posting · saved version{" "}
            {f.version_number}
          </p>
          <ul>
            {f.ai_provenance.citations.map((c) => (
              <li key={c.key}>
                <Link
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary-700 underline"
                  href={c.href}
                >
                  {c.label}
                </Link>{" "}
                · revision {c.revision}
                {!c.current && " · changed or unavailable"}
              </li>
            ))}
          </ul>
          {!f.ai_provenance.current && (
            <p>
              Cited context has changed. This feedback stays tied to its
              original saved version. Review the sources with your counselor
              before assigning new revision work.
            </p>
          )}
          <p>
            Feedback and revision tasks stay with the student and counseling
            team; essay sharing does not publish them to parents.
          </p>
        </div>
      )}
      {!f.resolved_at && !readOnly && (
        <button
          type="button"
          onClick={() => handleResolve(f.id)}
          disabled={isPending}
          className="mt-1 text-xs text-gray-500 hover:text-success-700"
        >
          Mark resolved
        </button>
      )}
      <EssayRevisionTask
        feedback={f}
        task={revisionTasks.find((t) => t.feedbackId === f.id)}
        canAssign={canAssignRevisions && !f.resolved_at}
        surface={surface}
        onEditingChange={(open) => onTaskEditorChange(open ? f.id : null)}
      />
    </li>
  );
}

// Server-rendered controls must not accept input that hydration would replace.
const subscribeToReady = () => () => {};
const clientReady = () => true;
const serverWaiting = () => false;

/**
 * Coaching feedback thread (fix plan 10.3), shared by the staff editor and
 * the student portal editor. Comments can quote a selected span of the
 * draft; the quote stays meaningful even after the text changes.
 */
export function FeedbackPanel({
  essayId,
  feedback,
  getSelection,
  readOnly = false,
  versionNumber,
  revisionTasks = [],
  canAssignRevisions = false,
  surface = "student",
  draftNeedsSnapshot = false,
}: {
  essayId: string;
  feedback: EssayFeedbackRow[];
  /** Returns the current textarea selection to attach as a quote. */
  getSelection?: () => SelectionAnchor | null;
  readOnly?: boolean;
  versionNumber: number;
  revisionTasks?: RevisionTask[];
  canAssignRevisions?: boolean;
  surface?: TaskSurface;
  draftNeedsSnapshot?: boolean;
}) {
  const router = useRouter();
  const ready = useSyncExternalStore(
    subscribeToReady,
    clientReady,
    serverWaiting,
  );
  const [body, setBody] = useState("");
  const [quote, setQuote] = useState<SelectionAnchor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [editingFeedback, setEditingFeedback] = useState<string | null>(null);
  const openCount = feedback.filter((f) => !f.resolved_at).length;
  // Keep the row in its current React parent while an assignment is open:
  // moving a newly resolved row into the collapsed list would discard edits.
  const open = feedback.filter(
    (f) => !f.resolved_at || f.id === editingFeedback,
  );
  const resolved = feedback.filter(
    (f) => f.resolved_at && f.id !== editingFeedback,
  );

  function handleQuoteSelection() {
    const selection = getSelection?.() ?? null;
    if (!selection) {
      setError("Select some essay text first, then click “Quote selection”.");
      return;
    }
    setError(null);
    setQuote(selection);
  }

  function handleAdd() {
    if (!body.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addEssayFeedback(essayId, {
        versionNumber,
        body,
        quotedText: quote?.quotedText ?? null,
        anchorStart: quote?.anchorStart ?? null,
        anchorEnd: quote?.anchorEnd ?? null,
      });
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setBody("");
      setQuote(null);
      router.refresh();
    });
  }

  function handleResolve(id: string) {
    startTransition(async () => {
      const result = await resolveEssayFeedback(id);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Feedback</h2>
          {openCount > 0 && <Badge variant="warning">{openCount} open</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert>{error}</Alert>}

        {feedback.length === 0 && (
          <p className="text-sm text-gray-500">No comments yet.</p>
        )}
        {open.length > 0 && (
          <ul className="space-y-2">
            {open.map((f) => (
              <CommentItem
                key={f.id}
                f={f}
                readOnly={readOnly}
                isPending={isPending}
                handleResolve={handleResolve}
                revisionTasks={revisionTasks}
                canAssignRevisions={canAssignRevisions}
                surface={surface}
                onTaskEditorChange={setEditingFeedback}
              />
            ))}
          </ul>
        )}
        {resolved.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs text-gray-500">
              {resolved.length} resolved
            </summary>
            <ul className="mt-2 space-y-2 opacity-70">
              {resolved.map((f) => (
                <CommentItem
                  key={f.id}
                  f={f}
                  readOnly={readOnly}
                  isPending={isPending}
                  handleResolve={handleResolve}
                  revisionTasks={revisionTasks}
                  canAssignRevisions={canAssignRevisions}
                  surface={surface}
                  onTaskEditorChange={setEditingFeedback}
                />
              ))}
            </ul>
          </details>
        )}

        {!readOnly && (
          <div className="border-t border-gray-100 pt-3">
            {quote && (
              <blockquote className="mb-2 flex items-start justify-between gap-2 border-l-2 border-primary-300 bg-primary-50 px-2 py-1 text-xs italic text-gray-600">
                <span>
                  “
                  {quote.quotedText.length > 120
                    ? `${quote.quotedText.slice(0, 120)}…`
                    : quote.quotedText}
                  ”
                </span>
                <button
                  type="button"
                  onClick={() => setQuote(null)}
                  aria-label="Remove quote"
                  className="rounded p-0.5 text-gray-500 hover:text-gray-700"
                >
                  <XMarkIcon className="h-3.5 w-3.5" />
                </button>
              </blockquote>
            )}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              placeholder="Add a comment…"
              aria-label="Feedback comment"
              disabled={!ready || isPending}
              maxLength={12000}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <div className="mt-2 flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleAdd}
                loading={isPending}
                disabled={!ready || draftNeedsSnapshot || !body.trim()}
              >
                Comment
              </Button>
              {getSelection && (
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={handleQuoteSelection}
                  disabled={!ready || draftNeedsSnapshot}
                >
                  Quote selection
                </Button>
              )}
            </div>
            {draftNeedsSnapshot && (
              <p className="mt-2 text-xs text-warning-800">
                Save a draft version before adding or quoting feedback. Autosave
                keeps working text; Save Draft records the version a comment
                refers to.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
