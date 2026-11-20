"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ExclamationTriangleIcon } from "@/components/icons";
import { EssayAiAssistance } from "@/components/essays/essay-ai-assistance";
import { brainstormResultSchema, outlineResultSchema } from "@/lib/ai/schemas";
import {
  analyzePromptForEssay,
  dismissCoachReviewSuggestion,
} from "@/lib/actions/essays-ai";
import type {
  BrainstormAngle,
  EarlierEssayPlanningResult,
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
  canReview: boolean;
  initialAnalysis: PromptAnalysis | null;
  canPlan: boolean;
  earlierPlanning: EarlierEssayPlanningResult[];
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
  canReview,
  initialAnalysis,
  canPlan,
  earlierPlanning,
  initialCoachReview,
}: Props) {
  return (
    <div className="mt-6 space-y-4">
      <PromptAnalysisSection
        essayId={essayId}
        hasPromptText={hasPromptText}
        initial={initialAnalysis}
        canAnalyze={canPlan}
      />
      <PlanningSection
        essayId={essayId}
        canPlan={canPlan}
        history={earlierPlanning}
      />
      {canReview && <CoachReviewSection initial={initialCoachReview} />}
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
  canAnalyze,
}: {
  essayId: string;
  hasPromptText: boolean;
  initial: PromptAnalysis | null;
  canAnalyze: boolean;
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
            icon={analysis ? "refresh" : "ai"}
            size="sm"
            variant={analysis ? "outline" : "primary"}
            onClick={run}
            disabled={!canAnalyze || !hasPromptText || isPending}
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
        {error && <Alert>{error}</Alert>}
        {analysis && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="primary">
                {PROMPT_TYPE_LABELS[analysis.prompt_type] ??
                  analysis.prompt_type}
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

function PlanningSection({
  essayId,
  canPlan,
  history,
}: {
  essayId: string;
  canPlan: boolean;
  history: EarlierEssayPlanningResult[];
}) {
  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold">Essay planning</h3>
        <p className="mt-1 text-sm text-gray-600">
          Choose student context, review its sources and edit a suggestion
          before saving a private response plan or connected outline. The
          student chooses the experiences and writes the essay in their own
          words.
        </p>
        {canPlan && (
          <div className="mt-3 flex flex-wrap gap-2">
            <EssayAiAssistance
              essayId={essayId}
              initialMode="story_matches"
              label="Find story-to-prompt connections"
            />
            <EssayAiAssistance
              essayId={essayId}
              initialMode="outline"
              label="Plan a connected outline"
            />
          </div>
        )}
      </CardHeader>
      <CardContent>
        <section
          aria-label="Earlier essay planning results"
          className="space-y-3"
        >
          <h4 className="text-sm font-semibold">
            Earlier essay planning results
          </h4>
          <p className="text-xs text-gray-600">
            These earlier results were generated without the selected-source
            workflow. They have no verified source citations and may contain
            suggested essay wording. Treat them as historical reference; check
            the facts and develop the ideas in the student’s own words. New
            planning does not replace these records or automatically reuse their
            text.
          </p>
          {!history.length && (
            <p className="text-sm text-gray-500">
              No earlier planning results.
            </p>
          )}
          {history.map((row) => {
            const brainstorm =
              row.kind === "brainstorm"
                ? brainstormResultSchema.safeParse(row.content)
                : null;
            const outline =
              row.kind === "outline"
                ? outlineResultSchema.safeParse(row.content)
                : null;
            return (
              <details
                key={row.id}
                className="rounded-lg border border-gray-200 p-3"
              >
                <summary className="cursor-pointer text-sm font-medium">
                  {row.kind === "brainstorm"
                    ? "Earlier brainstorm"
                    : "Earlier outline"}
                  {" · "}
                  <time dateTime={row.created_at}>
                    {"Saved " + row.created_at.slice(0, 10)}
                  </time>
                </summary>
                {brainstorm?.success && (
                  <div className="mt-3 space-y-3">
                    {brainstorm.data.angles.map((angle, i) => (
                      <AngleCard key={i} angle={angle} index={i} />
                    ))}
                  </div>
                )}
                {outline?.success && <OutlineDisplay outline={outline.data} />}
                {!brainstorm?.success && !outline?.success && (
                  <>
                    <p className="mt-3 text-xs">
                      Preserved result in an earlier format.
                    </p>
                    <pre className="mt-2 whitespace-pre-wrap break-words text-sm">
                      {JSON.stringify(row.content, null, 2)}
                    </pre>
                  </>
                )}
              </details>
            );
          })}
        </section>
      </CardContent>
    </Card>
  );
}

function AngleCard({
  angle,
  index,
}: {
  angle: BrainstormAngle;
  index: number;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium text-gray-500">#{index + 1}</span>
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

function OutlineDisplay({ outline }: { outline: OutlineResult }) {
  const sections: Array<{
    key: "hook" | "body" | "reflection";
    label: string;
  }> = [
    { key: "hook", label: "Opening" },
    { key: "body", label: "Body" },
    { key: "reflection", label: "Reflection" },
  ];

  return (
    <div className="mt-4 space-y-4 rounded-lg border border-gray-200 p-4">
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
          Original purpose or thesis
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
  initial,
}: {
  initial: StoredCoachReview | null;
}) {
  const [review, setReview] = useState(initial),
    [error, setError] = useState(""),
    [pending, start] = useTransition();
  const dismissed = new Set(review?.content.dismissed_suggestion_indices ?? []);
  function onDismiss(index: number) {
    if (!review) return;
    start(async () => {
      const r = await dismissCoachReviewSuggestion(review.id, index);
      if (r.error) setError(r.error);
      else
        setReview({
          ...review,
          content: {
            ...review.content,
            dismissed_suggestion_indices: [...dismissed, index],
          },
        });
    });
  }
  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold">Earlier coach review</h3>
        <p className="text-xs text-gray-500">
          Use Saved-version coaching in the connected writing workspace for new
          reviews with selected sources. Earlier reviews were not linked to a
          saved version.
        </p>
      </CardHeader>
      <CardContent>
        {error && <Alert>{error}</Alert>}
        {review ? (
          <div className="space-y-3">
            <p className="text-sm">{review.content.overall_assessment}</p>
            <ul aria-busy={pending}>
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
        ) : (
          <p className="text-sm text-gray-500">No earlier coach review.</p>
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
        dismissed ? "border-gray-200 bg-gray-50 opacity-60" : "border-gray-200"
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
            className="text-xs text-gray-500 hover:text-gray-600"
          >
            Dismiss
          </button>
        )}
        {dismissed && <span className="text-xs text-gray-500">Dismissed</span>}
      </div>
      {suggestion.quoted_span && (
        <blockquote className="mt-2 border-l-2 border-gray-300 pl-3 text-sm text-gray-700 italic">
          &ldquo;{suggestion.quoted_span}&rdquo;
        </blockquote>
      )}
      <p className="mt-2 text-sm text-gray-900">{suggestion.observation}</p>
      <div className="mt-2 rounded-md bg-primary-50 p-2 text-sm text-primary-900">
        <span className="font-medium">Ask the student:</span>{" "}
        {suggestion.prompting_question}
      </div>
      {!suggestion.preserves_voice && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-warning-800">
          <ExclamationTriangleIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          Model flagged this suggestion as potentially flattening voice — handle
          with care.
        </p>
      )}
    </li>
  );
}
