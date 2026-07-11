"use client";

import { useState, useTransition, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/modals/modal";
import {
  updateEssayDraft,
  updateEssayStatus,
  updateEssayVisibility,
  updateEssayLink,
  updateEssayTitle,
  deleteEssayDraft,
} from "@/lib/actions/essays";
import { AiAssistPanel } from "./ai-assist-panel";
import {
  ESSAY_STATUSES,
  ESSAY_STATUS_LABELS,
  ESSAY_STATUS_BADGES,
  ESSAY_TYPE_LABELS,
  resolveWordLimit,
} from "@/lib/constants/essays";
import type {
  BrainstormResult,
  CoachReviewResult,
  OutlineResult,
  PromptAnalysis,
} from "@/lib/ai/schemas";

export type StoredCoachReview = {
  id: string;
  content: CoachReviewResult & { dismissed_suggestion_indices?: number[] };
  created_at: string;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface EssayVersion {
  id: string;
  version_number: number;
  body: string;
  commentary: string | null;
  created_at: string;
  author_name: string;
}

interface EssayData {
  id: string;
  title: string;
  essay_type: string;
  status: string;
  prompt_text: string | null;
  body: string;
  word_count: number;
  word_count_target: number | null;
  current_version_number: number;
  visibility_scope: string;
  student_college_id: string | null;
  created_at: string;
  updated_at: string;
  student_id: string;
  student_name: string;
  created_by: string;
  current_user_id: string;
  prompt_analysis: PromptAnalysis | null;
  prompt_analysis_at: string | null;
  prompt_type: string | null;
  word_count_limit: number | null;
  latest_brainstorm:
    | { id: string; content: BrainstormResult; created_at: string }
    | null;
  latest_outline:
    | { id: string; content: OutlineResult; created_at: string }
    | null;
  latest_coach_review: StoredCoachReview | null;
  versions: EssayVersion[];
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

// ---------------------------------------------------------------------------
// Version History Modal
// ---------------------------------------------------------------------------
function VersionHistoryModal({
  open,
  onClose,
  versions,
  onRestore,
}: {
  open: boolean;
  onClose: () => void;
  versions: EssayVersion[];
  onRestore: (body: string) => void;
}) {
  const [selectedVersion, setSelectedVersion] = useState<EssayVersion | null>(
    null
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Version History"
      size="lg"
    >
      <div className="grid grid-cols-3 gap-4" style={{ minHeight: 300 }}>
        {/* Version list */}
        <div className="col-span-1 border-r border-gray-200 pr-4 space-y-1 overflow-y-auto max-h-[400px]">
          {versions.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelectedVersion(v)}
              className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${
                selectedVersion?.id === v.id
                  ? "bg-primary-50 text-primary-700"
                  : "hover:bg-gray-50"
              }`}
            >
              <p className="font-medium">Version {v.version_number}</p>
              <p className="text-xs text-gray-500">
                {v.author_name} &middot;{" "}
                {format(parseISO(v.created_at), "MMM d, h:mm a")}
              </p>
            </button>
          ))}
        </div>

        {/* Version preview */}
        <div className="col-span-2">
          {selectedVersion ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900">
                  Version {selectedVersion.version_number}
                </h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onRestore(selectedVersion.body);
                    onClose();
                  }}
                >
                  Restore This Version
                </Button>
              </div>
              {selectedVersion.commentary && (
                <div className="rounded-lg bg-yellow-50 p-3">
                  <p className="text-xs font-medium text-yellow-800 mb-0.5">
                    Commentary
                  </p>
                  <p className="text-sm text-yellow-700">
                    {selectedVersion.commentary}
                  </p>
                </div>
              )}
              <div className="rounded-lg border border-gray-200 p-4 max-h-[300px] overflow-y-auto">
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {selectedVersion.body || "(empty)"}
                </p>
              </div>
              <p className="text-xs text-gray-400">
                {countWords(selectedVersion.body)} words
              </p>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-gray-400">
                Select a version to preview
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main Editor
// ---------------------------------------------------------------------------
export function EssayEditorClient({
  essay,
  collegeOptions,
  canReview,
}: {
  essay: EssayData;
  collegeOptions: { id: string; name: string }[];
  canReview: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState(essay.body);
  const [title, setTitle] = useState(essay.title);
  const [commentary, setCommentary] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // "Unsaved" is derived from the last saved body. Re-baseline during render
  // when the server-provided draft changes (e.g. after revalidation).
  const [savedBody, setSavedBody] = useState(essay.body);
  const [prevEssayBody, setPrevEssayBody] = useState(essay.body);
  if (prevEssayBody !== essay.body) {
    setPrevEssayBody(essay.body);
    setSavedBody(essay.body);
  }
  const hasUnsaved = body !== savedBody;

  const wordCount = countWords(body);
  // One limit rule shared with the portal editor (fix plan 7.7).
  const wordLimit = resolveWordLimit(essay);
  const overLimit = wordLimit != null && wordCount > wordLimit;

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.max(ta.scrollHeight, 400)}px`;
    }
  }, [body]);

  const handleSave = useCallback(() => {
    setSaveMessage(null);
    startTransition(async () => {
      const result = await updateEssayDraft(
        essay.id,
        body,
        commentary || undefined
      );
      if (result.error) {
        setSaveMessage(result.error);
      } else {
        setSaveMessage(`Saved as v${result.version}`);
        setCommentary("");
        setSavedBody(body);
        setTimeout(() => setSaveMessage(null), 3000);
      }
    });
  }, [essay.id, body, commentary]);

  function handleVisibilityChange(visibility: string) {
    startTransition(async () => {
      await updateEssayVisibility(essay.id, visibility);
      router.refresh();
    });
  }

  function handleLinkChange(studentCollegeId: string) {
    startTransition(async () => {
      await updateEssayLink(essay.id, studentCollegeId || null);
      router.refresh();
    });
  }

  function handleStatusChange(status: string) {
    startTransition(async () => {
      await updateEssayStatus(essay.id, status);
    });
  }

  function handleTitleBlur() {
    if (title !== essay.title) {
      startTransition(async () => {
        await updateEssayTitle(essay.id, title);
      });
    }
  }

  function handleDelete() {
    if (!confirm("Delete this essay draft and all versions?")) return;
    startTransition(async () => {
      await deleteEssayDraft(essay.id);
      router.push("/essays");
    });
  }

  function handleRestore(restoredBody: string) {
    setBody(restoredBody);
  }

  // Keyboard shortcut: Ctrl/Cmd+S to save
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (hasUnsaved) handleSave();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [hasUnsaved, handleSave]);

  return (
    <PageShell
      title=""
      description=""
      actions={
        <div className="flex items-center gap-2">
          {saveMessage && (
            <span
              className={`text-sm ${
                saveMessage.includes("error") || saveMessage.includes("Failed")
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              {saveMessage}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowVersions(true)}
          >
            History (v{essay.current_version_number})
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending || !hasUnsaved}
            size="sm"
          >
            {isPending ? "Saving..." : hasUnsaved ? "Save Draft" : "Saved"}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Editor (main area) */}
        <div className="lg:col-span-3">
          <Card>
            {/* Title bar */}
            <div className="border-b border-gray-200 px-6 py-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleBlur}
                className="w-full text-xl font-semibold text-gray-900 focus:outline-none"
                placeholder="Essay title..."
              />
              <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                <span>{essay.student_name}</span>
                <span>&middot;</span>
                <span>
                  {ESSAY_TYPE_LABELS[essay.essay_type] ?? essay.essay_type}
                </span>
                <span>&middot;</span>
                <Badge variant={ESSAY_STATUS_BADGES[essay.status] ?? "default"}>
                  {ESSAY_STATUS_LABELS[essay.status] ?? essay.status}
                </Badge>
              </div>
            </div>

            {/* Prompt */}
            {essay.prompt_text && (
              <div className="border-b border-gray-100 bg-gray-50 px-6 py-3">
                <p className="text-xs font-medium text-gray-500 mb-1">
                  Prompt
                </p>
                <p className="text-sm text-gray-700 italic">
                  {essay.prompt_text}
                </p>
              </div>
            )}

            {/* Editor area */}
            <div className="px-6 py-4">
              <textarea
                ref={textareaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Start writing..."
                className="w-full resize-none text-sm leading-relaxed text-gray-800 focus:outline-none"
                style={{ minHeight: 400 }}
              />
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span
                  className={`text-sm font-medium ${
                    overLimit ? "text-red-600" : "text-gray-600"
                  }`}
                >
                  {wordCount} words
                  {wordLimit && (
                    <span className="text-gray-400"> / {wordLimit}</span>
                  )}
                </span>
                {wordLimit && (
                  <div className="w-32 h-1.5 rounded-full bg-gray-200">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        overLimit ? "bg-red-500" : "bg-green-500"
                      }`}
                      style={{
                        width: `${Math.min((wordCount / wordLimit) * 100, 100)}%`,
                      }}
                    />
                  </div>
                )}
              </div>
              {hasUnsaved && (
                <span className="text-xs text-amber-600">Unsaved changes</span>
              )}
            </div>
          </Card>

          {/* Commentary for next save */}
          {hasUnsaved && (
            <Card className="mt-4">
              <CardContent>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Version Note (optional)
                </label>
                <input
                  value={commentary}
                  onChange={(e) => setCommentary(e.target.value)}
                  placeholder="e.g. Revised intro paragraph, tightened conclusion..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Status */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-gray-900">Status</h3>
            </CardHeader>
            <CardContent>
              <select
                value={essay.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {ESSAY_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>

          {/* Sharing & linking */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-gray-900">
                Sharing &amp; Linking
              </h3>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Visible to
                </label>
                <select
                  value={essay.visibility_scope}
                  onChange={(e) => handleVisibilityChange(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="student">Student (can write &amp; edit)</option>
                  <option value="family">Student + family</option>
                  <option value="staff">Staff only</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  For college
                </label>
                <select
                  value={essay.student_college_id ?? ""}
                  onChange={(e) => handleLinkChange(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">Not linked</option>
                  {collegeOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-gray-900">Details</h3>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-gray-500">Student</dt>
                  <dd className="text-gray-900">{essay.student_name}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Type</dt>
                  <dd className="text-gray-900">
                    {ESSAY_TYPE_LABELS[essay.essay_type] ?? essay.essay_type}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Created</dt>
                  <dd className="text-gray-900">
                    {format(parseISO(essay.created_at), "MMM d, yyyy")}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Last Updated</dt>
                  <dd className="text-gray-900">
                    {format(parseISO(essay.updated_at), "MMM d, yyyy h:mm a")}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Created By</dt>
                  <dd className="text-gray-900">{essay.created_by}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Version</dt>
                  <dd className="text-gray-900">
                    v{essay.current_version_number}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Recent Versions */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                  Versions
                </h3>
                <button
                  onClick={() => setShowVersions(true)}
                  className="text-xs text-primary-600 hover:text-primary-700"
                >
                  View All
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {essay.versions.length === 0 ? (
                <p className="text-sm text-gray-400">No versions saved yet</p>
              ) : (
                <ul className="space-y-2">
                  {essay.versions.slice(0, 5).map((v) => (
                    <li
                      key={v.id}
                      className="border-b border-gray-50 pb-2 last:border-0"
                    >
                      <p className="text-xs font-medium text-gray-700">
                        v{v.version_number}
                        <span className="font-normal text-gray-400">
                          {" "}
                          by {v.author_name}
                        </span>
                      </p>
                      <p className="text-[10px] text-gray-400">
                        {format(parseISO(v.created_at), "MMM d, h:mm a")}
                      </p>
                      {v.commentary && (
                        <p className="text-xs text-gray-500 mt-0.5 italic">
                          {v.commentary}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Danger zone */}
          <Card>
            <CardContent>
              <button
                onClick={handleDelete}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Delete Essay Draft
              </button>
            </CardContent>
          </Card>
        </div>
      </div>

      <AiAssistPanel
        essayId={essay.id}
        hasPromptText={!!essay.prompt_text?.trim()}
        hasDraftBody={!!essay.body?.trim()}
        canReview={canReview}
        initialAnalysis={essay.prompt_analysis}
        initialBrainstorm={essay.latest_brainstorm?.content ?? null}
        initialOutline={essay.latest_outline?.content ?? null}
        initialCoachReview={essay.latest_coach_review ?? null}
      />

      <VersionHistoryModal
        open={showVersions}
        onClose={() => setShowVersions(false)}
        versions={essay.versions}
        onRestore={handleRestore}
      />
    </PageShell>
  );
}
