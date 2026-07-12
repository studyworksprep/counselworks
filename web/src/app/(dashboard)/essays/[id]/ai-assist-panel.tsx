"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import {
  analyzePromptForEssay,
  brainstormAnglesForEssay,
  dismissCoachReviewSuggestion,
  generateOutlineForEssay,
  requestCoachReview,
} from "@/lib/actions/essays-ai";
import type {
  BrainstormAngle,
  BrainstormResult,
  CoachReviewResult,
  OutlineResult,
  PromptAnalysis,
  ReviewCategory,
  ReviewSuggestion,
} from "@/lib/ai/schemas";

type StoredCoachReview = {
  id: string;
  content: CoachReviewResult & { dismissed_suggestion_indices?: number[] };
  created_at: string;
};

interface Props {
  essayId: string;
  hasPromptText: boolean;
  hasDraftBody: boolean;
  canReview: boolean;
  initialAnalysis: PromptAnalysis | null;
  initialBrainstorm: BrainstormResult | null;
  initialOutline: OutlineResult | null;
  initialCoachReview: StoredCoachReview | null;
}

const PROMPT_TYPE_LABELS: Record<string, string> = {
  why_us: "Why us",
  personal_narrative: "Personal narrative",
  creative: "Creative",
  activity_expansion: "Activity expansion",
  community: "Community",
  diversity: "Diversity",
  intellectual_curiosity: "Intellectual curiosity",
  leadership: "Leadership",
  other: "Other",
};

export function AiAssistPanel({
  essayId,
  hasPromptText,
  hasDraftBody,
  canReview,
  initialAnalysis,
  initialBrainstorm,
  initialOutline,
  initialCoachReview,
}: Props) {
  return (
    <div className="mt-6 space-y-4">
      <PromptAnalysisSection
        essayId={essayId}
        hasPromptText={hasPromptText}
        initial={initialAnalysis}
      />
      <BrainstormSection
        essayId={essayId}
        hasPromptText={hasPromptText}
        initial={initialBrainstorm}
      />
      <OutlineSection
        essayId={essayId}
        hasPromptText={hasPromptText}
        initial={initialOutline}
        brainstormAngles={initialBrainstorm?.angles ?? []}
      />
      {canReview && (
        <CoachReviewSection
          essayId={essayId}
          hasPromptText={hasPromptText}
          hasDraftBody={hasDraftBody}
          initial={initialCoachReview}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prompt analysis
// ---------------------------------------------------------------------------

function PromptAnalysisSection({
  essayId,
  hasPromptText,
  initial,
}: {
  essayId: string;
  hasPromptText: boolean;
  initial: PromptAnalysis | null;
}) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<PromptAnalysis | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await analyzePromptForEssay(essayId);
      if ("error" in result) setError(result.error);
      else {
        setAnalysis(result.data);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Prompt analysis
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Extract what this prompt is really asking.
            </p>
          </div>
          <Button
            size="sm"
            variant={analysis ? "outline" : "primary"}
            onClick={run}
            disabled={!hasPromptText || isPending}
          >
            {isPending
              ? "Analyzing..."
              : analysis
                ? "Re-analyze"
                : "Analyze prompt"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!hasPromptText && (
          <p className="text-sm text-gray-500">
            Paste the supplement prompt at the top of the editor first.
          </p>
        )}
        {hasPromptText && !analysis && !isPending && !error && (
          <p className="text-sm text-gray-500">
            Click <span className="font-medium">Analyze prompt</span> to extract
            prompt type, word limit, and what the reader actually wants.
          </p>
        )}
        {error && (
          <Alert>{error}</Alert>
        )}
        {analysis && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">
                {PROMPT_TYPE_LABELS[analysis.prompt_type] ?? analysis.prompt_type}
              </Badge>
              {analysis.word_count_limit !== null && (
                <Badge variant="default">
                  {analysis.word_count_limit} words
                </Badge>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                What the reader actually wants to know
              </p>
              <p className="text-gray-900">{analysis.underlying_question}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Qualities this prompt is designed to surface
              </p>
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                {analysis.what_they_want_to_see.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Common pitfalls
              </p>
              <ul className="list-disc pl-5 space-y-1 text-gray-700">
                {analysis.common_pitfalls.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Brainstorm angles
// ---------------------------------------------------------------------------

function BrainstormSection({
  essayId,
  hasPromptText,
  initial,
}: {
  essayId: string;
  hasPromptText: boolean;
  initial: BrainstormResult | null;
}) {
  const router = useRouter();
  const [result, setResult] = useState<BrainstormResult | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const r = await brainstormAnglesForEssay(essayId);
      if ("error" in r) setError(r.error);
      else {
        setResult(r.data);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Brainstorm angles
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Surface 3–5 candidate angles drawing on the student&apos;s profile.
            </p>
          </div>
          <Button
            size="sm"
            variant={result ? "outline" : "primary"}
            onClick={run}
            disabled={!hasPromptText || isPending}
          >
            {isPending
              ? "Thinking..."
              : result
                ? "Generate new set"
                : "Brainstorm angles"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!hasPromptText && (
          <p className="text-sm text-gray-500">
            Add the prompt text first.
          </p>
        )}
        {hasPromptText && !result && !isPending && !error && (
          <p className="text-sm text-gray-500">
            Click <span className="font-medium">Brainstorm angles</span> to pull
            3–5 candidate directions from the student&apos;s profile.
          </p>
        )}
        {error && (
          <Alert>{error}</Alert>
        )}
        {result && (
          <div className="space-y-3">
            {result.angles.map((angle, i) => (
              <AngleCard key={i} angle={angle} index={i} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AngleCard({ angle, index }: { angle: BrainstormAngle; index: number }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium text-gray-400">#{index + 1}</span>
        <h4 className="text-sm font-semibold text-gray-900">{angle.title}</h4>
      </div>
      <p className="mt-2 text-sm text-gray-700 italic border-l-2 border-gray-200 pl-3">
        {angle.hook}
      </p>
      <p className="mt-2 text-sm text-gray-700">{angle.why_it_works}</p>
      <div className="mt-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
          Questions to draw out detail
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
          {angle.questions_to_explore.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outline
// ---------------------------------------------------------------------------

function OutlineSection({
  essayId,
  hasPromptText,
  initial,
  brainstormAngles,
}: {
  essayId: string;
  hasPromptText: boolean;
  initial: OutlineResult | null;
  brainstormAngles: BrainstormAngle[];
}) {
  const router = useRouter();
  const [result, setResult] = useState<OutlineResult | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [hook, setHook] = useState("");

  function pickAngle(angle: BrainstormAngle) {
    setTitle(angle.title);
    setHook(angle.hook);
  }

  function run() {
    setError(null);
    startTransition(async () => {
      const r = await generateOutlineForEssay(essayId, title, hook);
      if ("error" in r) setError(r.error);
      else {
        setResult(r.data);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold text-gray-900">Outline</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Pick an angle and generate a thesis + beat-by-beat scaffold.
        </p>
      </CardHeader>
      <CardContent>
        {!hasPromptText && (
          <p className="text-sm text-gray-500">Add the prompt text first.</p>
        )}
        {hasPromptText && (
          <div className="space-y-3">
            {brainstormAngles.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Use a brainstormed angle
                </p>
                <div className="flex flex-wrap gap-2">
                  {brainstormAngles.map((angle, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pickAngle(angle)}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        title === angle.title
                          ? "border-primary-500 bg-primary-50 text-primary-700"
                          : "border-gray-300 text-gray-700 hover:border-gray-400"
                      }`}
                    >
                      {angle.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Angle title
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='e.g. "Late nights in the chem lab"'
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Opening hook idea
              </label>
              <textarea
                value={hook}
                onChange={(e) => setHook(e.target.value)}
                rows={2}
                placeholder="One sentence that grounds the reader in a specific moment..."
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={run}
                disabled={!title.trim() || !hook.trim() || isPending}
              >
                {isPending
                  ? "Generating..."
                  : result
                    ? "Generate new outline"
                    : "Generate outline"}
              </Button>
              {error && (
                <span className="text-sm text-danger-600">{error}</span>
              )}
            </div>
            {result && <OutlineDisplay outline={result} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OutlineDisplay({ outline }: { outline: OutlineResult }) {
  const sections: Array<{
    key: "hook" | "body" | "reflection";
    label: string;
  }> = [
    { key: "hook", label: "Hook" },
    { key: "body", label: "Body" },
    { key: "reflection", label: "Reflection" },
  ];

  return (
    <div className="mt-4 space-y-4 rounded-lg border border-gray-200 p-4">
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
          Thesis
        </p>
        <p className="text-sm font-medium text-gray-900">{outline.thesis}</p>
      </div>
      {sections.map((section) => {
        const beats = outline.beats.filter((b) => b.section === section.key);
        if (beats.length === 0) return null;
        return (
          <div key={section.key}>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              {section.label}
            </p>
            <ol className="space-y-2">
              {beats.map((beat, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                    {outline.beats.indexOf(beat) + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-gray-900">{beat.beat}</p>
                    {beat.word_target !== null && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Target: ~{beat.word_target} words
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coach review (counselor-only)
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<ReviewCategory, string> = {
  specificity: "Specificity",
  vague_claim: "Vague claim",
  voice_consistency: "Voice consistency",
  redundancy: "Redundancy",
  transition: "Transition",
  prompt_coverage: "Prompt coverage",
  word_count: "Word count",
};

const CATEGORY_VARIANT: Record<
  ReviewCategory,
  "primary" | "warning" | "danger" | "default" | "success"
> = {
  specificity: "primary",
  vague_claim: "warning",
  voice_consistency: "warning",
  redundancy: "default",
  transition: "default",
  prompt_coverage: "danger",
  word_count: "default",
};

function CoachReviewSection({
  essayId,
  hasPromptText,
  hasDraftBody,
  initial,
}: {
  essayId: string;
  hasPromptText: boolean;
  hasDraftBody: boolean;
  initial: StoredCoachReview | null;
}) {
  const router = useRouter();
  const [review, setReview] = useState<StoredCoachReview | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const r = await requestCoachReview(essayId);
      if ("error" in r) setError(r.error);
      else {
        setReview(r.data);
        router.refresh();
      }
    });
  }

  function onDismiss(index: number) {
    if (!review) return;
    // Optimistic update — server persists via the action.
    const existing = new Set(review.content.dismissed_suggestion_indices ?? []);
    existing.add(index);
    setReview({
      ...review,
      content: {
        ...review.content,
        dismissed_suggestion_indices: Array.from(existing).sort(
          (a, b) => a - b,
        ),
      },
    });
    startTransition(async () => {
      await dismissCoachReviewSuggestion(review.id, index);
    });
  }

  const dismissed = new Set(
    review?.content.dismissed_suggestion_indices ?? [],
  );
  const activeCount = review
    ? review.content.suggestions.filter((_, i) => !dismissed.has(i)).length
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Coach review (staff-only)
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              AI surfaces specific, voice-preserving suggestions on the
              current draft. Suggestions, not rewrites.
            </p>
          </div>
          <Button
            size="sm"
            variant={review ? "outline" : "primary"}
            onClick={run}
            disabled={!hasPromptText || !hasDraftBody || isPending}
          >
            {isPending
              ? "Reviewing..."
              : review
                ? "Re-review"
                : "Request review"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!hasPromptText && (
          <p className="text-sm text-gray-500">Add the prompt text first.</p>
        )}
        {hasPromptText && !hasDraftBody && (
          <p className="text-sm text-gray-500">
            The student hasn&apos;t written a draft yet. Coach review runs
            against the current draft body.
          </p>
        )}
        {hasPromptText && hasDraftBody && !review && !isPending && !error && (
          <p className="text-sm text-gray-500">
            Click <span className="font-medium">Request review</span> to get
            categorized suggestions you can apply with the student.
          </p>
        )}
        {error && (
          <Alert>{error}</Alert>
        )}
        {review && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Overall assessment
              </p>
              <p className="text-sm text-gray-900">
                {review.content.overall_assessment}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Suggestions ({activeCount} active
                {dismissed.size > 0 && ` · ${dismissed.size} dismissed`})
              </p>
              <ul className="space-y-3">
                {review.content.suggestions.map((suggestion, index) => (
                  <SuggestionRow
                    key={index}
                    suggestion={suggestion}
                    index={index}
                    dismissed={dismissed.has(index)}
                    onDismiss={onDismiss}
                  />
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SuggestionRow({
  suggestion,
  index,
  dismissed,
  onDismiss,
}: {
  suggestion: ReviewSuggestion;
  index: number;
  dismissed: boolean;
  onDismiss: (index: number) => void;
}) {
  return (
    <li
      className={`rounded-lg border p-3 transition-opacity ${
        dismissed
          ? "border-gray-200 bg-gray-50 opacity-60"
          : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <Badge variant={CATEGORY_VARIANT[suggestion.category]}>
          {CATEGORY_LABELS[suggestion.category]}
        </Badge>
        {!dismissed && (
          <button
            type="button"
            onClick={() => onDismiss(index)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Dismiss
          </button>
        )}
        {dismissed && (
          <span className="text-xs text-gray-400">Dismissed</span>
        )}
      </div>
      {suggestion.quoted_span && (
        <blockquote className="mt-2 border-l-2 border-gray-300 pl-3 text-sm text-gray-700 italic">
          &ldquo;{suggestion.quoted_span}&rdquo;
        </blockquote>
      )}
      <p className="mt-2 text-sm text-gray-900">{suggestion.observation}</p>
      <div className="mt-2 rounded-md bg-blue-50 p-2 text-sm text-blue-900">
        <span className="font-medium">Ask the student:</span>{" "}
        {suggestion.prompting_question}
      </div>
      {!suggestion.preserves_voice && (
        <p className="mt-2 text-xs text-amber-600">
          ⚠ Model flagged this suggestion as potentially flattening voice —
          handle with care.
        </p>
      )}
    </li>
  );
}
