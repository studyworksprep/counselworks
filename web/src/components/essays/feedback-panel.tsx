"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatDate } from "@/lib/utils";
import {
  addEssayFeedback,
  resolveEssayFeedback,
} from "@/lib/actions/essays";
import type { EssayFeedbackRow } from "@/lib/db/queries";

export interface SelectionAnchor {
  quotedText: string;
  anchorStart: number;
  anchorEnd: number;
}

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
}: {
  essayId: string;
  feedback: EssayFeedbackRow[];
  /** Returns the current textarea selection to attach as a quote. */
  getSelection?: () => SelectionAnchor | null;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [quote, setQuote] = useState<SelectionAnchor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const open = feedback.filter((f) => !f.resolved_at);
  const resolved = feedback.filter((f) => f.resolved_at);

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
      await resolveEssayFeedback(id);
      router.refresh();
    });
  }

  function CommentItem({ f }: { f: EssayFeedbackRow }) {
    return (
      <li className="border-b border-gray-50 pb-2 last:border-0">
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
        </p>
        {f.quoted_text && (
          <blockquote className="mt-1 border-l-2 border-primary-200 bg-primary-50/50 px-2 py-1 text-xs italic text-gray-600">
            “{f.quoted_text.length > 160
              ? `${f.quoted_text.slice(0, 160)}…`
              : f.quoted_text}”
          </blockquote>
        )}
        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
          {f.body}
        </p>
        {!f.resolved_at && !readOnly && (
          <button
            type="button"
            onClick={() => handleResolve(f.id)}
            disabled={isPending}
            className="mt-1 text-xs text-gray-400 hover:text-success-700"
          >
            Mark resolved
          </button>
        )}
      </li>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Feedback</h3>
          {open.length > 0 && <Badge variant="warning">{open.length} open</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert>{error}</Alert>}

        {feedback.length === 0 && (
          <p className="text-sm text-gray-400">No comments yet.</p>
        )}
        {open.length > 0 && <ul className="space-y-2">{open.map((f) => <CommentItem key={f.id} f={f} />)}</ul>}
        {resolved.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs text-gray-400">
              {resolved.length} resolved
            </summary>
            <ul className="mt-2 space-y-2 opacity-70">
              {resolved.map((f) => (
                <CommentItem key={f.id} f={f} />
              ))}
            </ul>
          </details>
        )}

        {!readOnly && (
          <div className="border-t border-gray-100 pt-3">
            {quote && (
              <blockquote className="mb-2 flex items-start justify-between gap-2 border-l-2 border-primary-300 bg-primary-50 px-2 py-1 text-xs italic text-gray-600">
                <span>
                  “{quote.quotedText.length > 120
                    ? `${quote.quotedText.slice(0, 120)}…`
                    : quote.quotedText}”
                </span>
                <button
                  type="button"
                  onClick={() => setQuote(null)}
                  aria-label="Remove quote"
                  className="text-gray-400 hover:text-gray-700"
                >
                  ✕
                </button>
              </blockquote>
            )}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              placeholder="Add a comment…"
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" onClick={handleAdd} loading={isPending}>
                Comment
              </Button>
              {getSelection && (
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={handleQuoteSelection}
                >
                  Quote selection
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
