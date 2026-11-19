"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { loadEssayAiAssistance } from "@/lib/actions/essay-ai";
import {
  contextKey,
  contextReference,
  contextSourceLabel,
  type ContextReference,
  type StudentContextSource,
} from "@/lib/ai/student-context";
import type { EssayProvenance } from "@/lib/ai/essay-context";

export function EssaySourceCitations({
  provenance,
  newTab = false,
}: {
  provenance?: EssayProvenance;
  newTab?: boolean;
}) {
  if (!provenance?.refs.length) return null;
  return (
    <div className="mt-3 space-y-2 text-xs" aria-label="Cited student context">
      <p className="font-medium">Context used in this working draft</p>
      <ul className="space-y-1">
        {provenance.citations.map((c) => (
          <li key={c.key}>
            <Link
              target={newTab ? "_blank" : undefined}
              rel={newTab ? "noreferrer" : undefined}
              href={c.href}
              className="text-primary-700 underline underline-offset-2"
            >
              {c.label}
            </Link>{" "}
            · revision {c.revision}
            {!c.current && " · Changed or unavailable"}
          </li>
        ))}
      </ul>
      {!provenance.current && (
        <p className="text-warning-800">
          Cited context changed. Review its current version before confirming or
          sharing this draft.
        </p>
      )}
      {!provenance.familyReady && (
        <p className="text-gray-600">
          Parent access is paused until every cited source is current and
          family-shared.
        </p>
      )}
    </div>
  );
}

/** Source updates are explicit: never silently swap revisions or drop withdrawn
 * evidence while retaining the text derived from it. */
export function EssaySourceReview({
  essayId,
  provenance,
  onChange,
}: {
  essayId: string;
  provenance?: EssayProvenance;
  onChange: (refs: ContextReference[], familyReady: boolean) => void;
}) {
  const id = useId(),
    [pending, start] = useTransition(),
    [error, setError] = useState("");
  const [review, setReview] = useState<{
      sources: StudentContextSource[];
      familyKeys: string[];
    } | null>(null),
    [updated, setUpdated] = useState(false);
  if (!provenance?.refs.length) return null;
  return (
    <div className="space-y-3 rounded-lg border border-gray-200 p-3">
      <EssaySourceCitations provenance={provenance} newTab />
      <Button
        type="button"
        size="sm"
        variant="outline"
        loading={pending}
        onClick={() =>
          start(async () => {
            setError("");
            try {
              const result = await loadEssayAiAssistance(essayId);
              if ("error" in result && result.error) {
                setError(result.error);
                return;
              }
              if ("data" in result && result.data) {
                const workspace = result.data;
                setReview({
                  sources: workspace.sources.filter((s) =>
                    provenance.refs.some(
                      (r) => contextKey(r) === contextKey(s),
                    ),
                  ),
                  familyKeys: workspace.familySourceKeys,
                });
                setUpdated(false);
              }
            } catch {
              setError(
                "Unable to load cited context. Your edits are still here.",
              );
            }
          })
        }
      >
        Review updated cited context
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger-700">
          {error}
        </p>
      )}
      {review && (
        <div id={`${id}-sources`} className="space-y-3">
          {review.sources.map((s) => (
            <details key={contextKey(s)}>
              <summary className="cursor-pointer text-sm font-medium">
                {contextSourceLabel(s, "student")} · revision {s.revision}
              </summary>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
                {s.text}
              </p>
            </details>
          ))}
          {review.sources.length !== provenance.refs.length ? (
            <p className="text-sm text-warning-800">
              A cited source is no longer available. Keep this as a private
              draft and review the source with your counselor, or create a new
              suggestion from available context.
            </p>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={updated}
              onClick={() => {
                onChange(
                  review.sources.map(contextReference),
                  review.sources.every((s) =>
                    review.familyKeys.includes(contextKey(s)),
                  ),
                );
                setUpdated(true);
              }}
            >
              Use reviewed source versions
            </Button>
          )}
          {updated && (
            <p role="status" className="text-xs text-gray-600">
              Source versions updated in this form. Review the planning text
              before saving.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
