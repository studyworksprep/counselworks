"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/modals/modal";
import { ActionForm, Hidden } from "@/components/interview/action-form";
import {
  acceptEssayAiSuggestion,
  loadEssayAiAssistance,
  requestEssayAiAssistance,
} from "@/lib/actions/essay-ai";
import {
  contextKey,
  contextReference,
  contextSourceLabel,
} from "@/lib/ai/student-context";
import {
  ESSAY_ASSISTANCE_MODES,
  ESSAY_ASSISTANCE_LABELS,
  editableOutline,
  essayCitation,
  type ConnectedOutline,
  type EssayAiRequest,
  type EssayAiWorkspace,
  type EssayAssistanceMode,
  type StoryMatches,
} from "@/lib/ai/essay-context";
import type { OutlineContent } from "@/lib/essays/drafting";

function Citations({
  workspace,
  keys,
}: {
  workspace: EssayAiWorkspace;
  keys: string[];
}) {
  return (
    <ul className="mt-2 space-y-1 text-xs" aria-label="Suggestion sources">
      {keys.map((key) => {
        const s = workspace.sources.find((s) => contextKey(s) === key);
        if (!s) return null;
        const c = essayCitation(
          s,
          s,
          workspace.drafting.studentId,
          workspace.drafting.surface,
        );
        return (
          <li key={key}>
            <Link
              target="_blank"
              rel="noreferrer"
              href={c.href}
              className="text-primary-700 underline underline-offset-2"
            >
              {c.label}
            </Link>{" "}
            · revision {c.revision}
          </li>
        );
      })}
    </ul>
  );
}
function ReviewSuggestion({
  workspace,
  request,
  index,
  onDirty,
  onPending,
  onSaved,
  enabled,
}: {
  enabled: boolean;
  workspace: EssayAiWorkspace;
  request: EssayAiRequest;
  index: number;
  onDirty: (dirty: boolean) => void;
  onPending: (pending: boolean) => void;
  onSaved: () => void;
}) {
  const id = useId(),
    isStory = request.mode === "story_matches";
  const match = isStory
    ? (request.result as StoryMatches).matches[index]
    : null;
  const result = !isStory ? (request.result as ConnectedOutline) : null;
  const [content, setContent] = useState<OutlineContent>(() =>
    result
      ? editableOutline(
          result,
          result.beats.map(() => crypto.randomUUID()),
        )
      : { purpose: "", beats: [] },
  );
  const [dirty, setDirty] = useState(false),
    [open, setOpen] = useState(false);
  function change(next: OutlineContent) {
    setContent(next);
    setDirty(true);
    onDirty(true);
  }
  return (
    <div className="mt-3 rounded-lg border border-gray-200 p-3">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!enabled || open}
        onClick={() => {
          setOpen(true);
          setDirty(true);
          onDirty(true);
        }}
      >
        Review and edit before saving
      </Button>
      {open && (
        <>
          <p className="my-3 text-sm leading-6 text-gray-600">
            {isStory
              ? "Saving replaces this response’s angle and material connections with the choice shown below. Other essays and the story bank keep their own connections."
              : "Saving replaces this essay’s working outline with the sections shown below."}{" "}
            This saves a private draft for the student and counseling team. The
            student reviews and chooses parent sharing separately. Essay writing
            is unchanged.
          </p>
          {isStory && workspace.drafting.row.plan && (
            <details className="my-3 text-sm">
              <summary className="cursor-pointer font-medium">
                Current response plan to replace
              </summary>
              <p className="mt-2 whitespace-pre-wrap">
                {workspace.drafting.row.plan.angle}
              </p>
              <p className="mt-2 text-xs">
                Connected material:{" "}
                {workspace.drafting.entries
                  .filter((e) => workspace.drafting.row.entryIds.includes(e.id))
                  .map((e) => e.title)
                  .join(", ") || "None"}
              </p>
            </details>
          )}
          {!isStory && workspace.drafting.outline && (
            <details className="my-3 text-sm">
              <summary className="cursor-pointer font-medium">
                Current outline to replace
              </summary>
              <p className="mt-2 whitespace-pre-wrap">
                {workspace.drafting.outline.content.purpose}
              </p>
              <ul className="mt-2 space-y-2">
                {workspace.drafting.outline.content.beats.map((b) => (
                  <li key={b.id}>
                    <strong>{b.heading}</strong>
                    <p className="whitespace-pre-wrap">{b.notes}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <ActionForm
            action={acceptEssayAiSuggestion}
            label={
              isStory
                ? "Save as private response plan"
                : "Save as private outline"
            }
            externalDirty={dirty}
            onDirty={(changed) => {
              setDirty(changed);
              onDirty(changed);
            }}
            onPendingChange={onPending}
            onSaved={onSaved}
          >
            <Hidden name="essay_id" value={workspace.drafting.essayId} />
            <Hidden name="request_id" value={request.id} />
            <Hidden name="index" value={index} />
            {match ? (
              <>
                <Textarea
                  id={`${id}-angle`}
                  label="Response angle to save"
                  name="angle"
                  maxLength={6000}
                  rows={4}
                  required
                  defaultValue={match.angle}
                />
                <p className="text-sm">
                  Connect:{" "}
                  {match.entryIds
                    .map(
                      (entry) =>
                        workspace.sources.find(
                          (s) => s.kind === "bank" && s.id === entry,
                        )?.label ?? "Selected material",
                    )
                    .join(" · ")}
                </p>
              </>
            ) : (
              <>
                <Hidden name="content" value={JSON.stringify(content)} />
                <Textarea
                  id={`${id}-purpose`}
                  label="Outline purpose to save"
                  rows={3}
                  maxLength={2000}
                  required
                  value={content.purpose}
                  onChange={(e) =>
                    change({ ...content, purpose: e.target.value })
                  }
                />
                {content.beats.map((beat, i) => (
                  <fieldset
                    key={beat.id}
                    className="space-y-3 rounded-lg border border-gray-200 p-3"
                  >
                    <legend className="px-1 text-sm font-medium">
                      Section {i + 1}
                    </legend>
                    <Input
                      id={`${id}-${beat.id}-heading`}
                      label="Section heading"
                      maxLength={160}
                      required
                      value={beat.heading}
                      onChange={(e) =>
                        change({
                          ...content,
                          beats: content.beats.map((b) =>
                            b.id === beat.id
                              ? { ...b, heading: e.target.value }
                              : b,
                          ),
                        })
                      }
                    />
                    <Textarea
                      id={`${id}-${beat.id}-notes`}
                      label="Questions and planning notes"
                      rows={3}
                      maxLength={3000}
                      required
                      value={beat.notes}
                      onChange={(e) =>
                        change({
                          ...content,
                          beats: content.beats.map((b) =>
                            b.id === beat.id
                              ? { ...b, notes: e.target.value }
                              : b,
                          ),
                        })
                      }
                    />
                    <p className="text-xs text-gray-600">
                      Connected material:{" "}
                      {beat.entry_ids
                        .map(
                          (entry) =>
                            workspace.sources.find(
                              (s) => s.kind === "bank" && s.id === entry,
                            )?.label ?? "Selected material",
                        )
                        .join(" · ") ||
                        "Context guidance; no personal story assigned"}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={content.beats.length === 1}
                      onClick={() =>
                        change({
                          ...content,
                          beats: content.beats.filter((b) => b.id !== beat.id),
                        })
                      }
                    >
                      Remove section {i + 1}
                    </Button>
                  </fieldset>
                ))}
              </>
            )}
            <p className="text-xs leading-5 text-gray-600">
              Use these notes to decide what you want to say, then write it
              yourself. Check that every detail is accurate and each
              interpretation feels like yours. All selected context remains
              attached for source and sharing review, including context the AI
              did not cite in its answer.
            </p>
          </ActionForm>
        </>
      )}{" "}
    </div>
  );
}
function AssistanceDialog({
  essayId,
  onClose,
}: {
  essayId: string;
  onClose: () => void;
}) {
  const id = useId(),
    router = useRouter(),
    [workspace, setWorkspace] = useState<EssayAiWorkspace | null>(null),
    [mode, setMode] = useState<EssayAssistanceMode>("story_matches");
  const [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [pending, start] = useTransition(),
    [saving, setSaving] = useState(false),
    [dirty, setDirty] = useState<Record<string, boolean>>({}),
    [discard, setDiscard] = useState(false),
    [saved, setSaved] = useState(false);
  const hasEdits = Object.values(dirty).some(Boolean),
    busy = pending || saving;
  function close() {
    if (busy) return;
    if (hasEdits) setDiscard(true);
    else onClose();
  }
  const requiredKeys =
    workspace && mode === "outline"
      ? [
          ...new Set([
            ...(workspace.drafting.row.plan?.ai_source_refs ?? []).map(
              contextKey,
            ),
            ...workspace.drafting.row.entryIds.map((id) => `bank:${id}`),
          ]),
        ]
      : [];
  const keys = [...new Set([...selected, ...requiredKeys])];
  function load() {
    start(async () => {
      setError("");
      try {
        const result = await loadEssayAiAssistance(essayId);
        if ("error" in result && result.error) {
          setError(result.error);
          return;
        }
        if ("data" in result && result.data) {
          setWorkspace(result.data);
          setSelected((current) =>
            current.filter((key) =>
              result.data.sources.some((s) => contextKey(s) === key),
            ),
          );
        }
      } catch {
        setError("Unable to load context. Your edits are still here.");
      }
    });
  }
  return (
    <Modal
      open
      trapFocus
      onClose={close}
      title="AI essay planning"
      description="Connect your own experiences to the assigned prompt, then plan what you want to explore in your own words."
      size="lg"
      footer={
        <>
          {discard && (
            <>
              <p role="status" className="mr-auto text-sm text-warning-800">
                Your review edits have not been saved.
              </p>
              <Button variant="danger" disabled={busy} onClick={onClose}>
                Discard review edits
              </Button>
            </>
          )}
          <Button variant="outline" disabled={busy} onClick={close}>
            Close
          </Button>
        </>
      }
    >
      <section aria-label="Essay planning assistance" className="space-y-4">
        <p className="rounded-lg bg-primary-50 p-3 text-sm leading-6">
          AI suggests possible connections and questions. You choose the
          experience, meaning and language. It does not write your essay.
          Suggestions stay private to the requester; saved working drafts follow
          your existing student review and family-sharing controls.
        </p>
        <Button
          variant="outline"
          size="sm"
          loading={pending}
          disabled={saving || hasEdits}
          onClick={load}
        >
          {workspace ? "Refresh essay context" : "Review essay context"}
        </Button>
        {hasEdits && (
          <p className="text-xs text-warning-800">
            Save or discard your review edits before refreshing context or
            asking again.
          </p>
        )}
        {saved && (
          <p role="status" className="text-sm text-success-700">
            Saved as a private draft. Review it in the response plan or outline
            before confirming or sharing.
          </p>
        )}
        {workspace && (
          <>
            <details open className="rounded-lg border border-gray-200 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Assigned prompt and limits
              </summary>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
                {workspace.drafting.row.promptText || "No prompt recorded"}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                {workspace.drafting.row.wordLimit
                  ? `${workspace.drafting.row.wordLimit} words`
                  : "Word limit not recorded"}
                {workspace.drafting.row.characterLimit
                  ? ` · ${workspace.drafting.row.characterLimit} characters`
                  : ""}
              </p>
            </details>
            <Select
              id={`${id}-mode`}
              label="Planning help"
              value={mode}
              disabled={busy || hasEdits}
              onChange={(e) => {
                setMode(e.target.value as EssayAssistanceMode);
                setSelected([]);
                setSaved(false);
              }}
              options={ESSAY_ASSISTANCE_MODES.map((value) => ({
                value,
                label: ESSAY_ASSISTANCE_LABELS[value],
              }))}
            />
            {mode === "outline" && (
              <div className="rounded-lg bg-gray-50 p-3 text-sm">
                <p className="font-medium">Saved response angle</p>
                <p className="mt-2 whitespace-pre-wrap">
                  {workspace.drafting.row.plan?.angle ||
                    "Save a response angle first, either on the planning board or from a story suggestion."}
                </p>
                <p className="mt-2 text-xs text-gray-600">
                  The plan’s cited context and connected material are required
                  inputs. Confirm any unreviewed bank material before asking for
                  an outline.
                </p>
              </div>
            )}
            <fieldset disabled={busy || hasEdits} className="space-y-3">
              <legend className="mb-2 text-sm font-medium">
                Choose context to send to AI ({keys.length}/20)
              </legend>
              <p className="text-xs leading-5 text-gray-600">
                Only checked sources and the prompt are sent. An outline also
                uses the saved angle. Student interview replies, confirmed
                stories, and student-reviewed shared strategy sections are
                available. Parent interviews and private counselor notes are
                excluded.
              </p>
              {workspace.sources.map((s) => {
                const key = contextKey(s),
                  required = requiredKeys.includes(key);
                return (
                  <div
                    key={key}
                    className="rounded-lg border border-gray-200 p-3"
                  >
                    <label className="flex items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={keys.includes(key)}
                        disabled={required}
                        onChange={(e) =>
                          setSelected((prev) =>
                            e.target.checked
                              ? [...prev, key]
                              : prev.filter((k) => k !== key),
                          )
                        }
                      />
                      <span className="min-w-0 break-words">
                        {contextSourceLabel(s, "student")}
                        {required && (
                          <span className="block text-xs text-gray-500">
                            Required by the saved response plan
                          </span>
                        )}
                      </span>
                    </label>
                    <details className="ml-6 mt-2 text-xs">
                      <summary className="cursor-pointer">
                        Preview source · revision {s.revision}
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap break-words leading-6">
                        {s.text}
                      </p>
                    </details>
                  </div>
                );
              })}
              {!workspace.sources.length && (
                <p className="text-sm text-gray-600">
                  Save interview responses or confirm stories in the story bank
                  first.
                </p>
              )}
            </fieldset>
            <Button
              size="sm"
              loading={pending}
              disabled={saving || hasEdits || !keys.length || keys.length > 20}
              onClick={() =>
                start(async () => {
                  setError("");
                  setSaved(false);
                  try {
                    const refs = keys.map((key) =>
                      workspace.sources.find((s) => contextKey(s) === key),
                    );
                    if (refs.some((s) => !s)) {
                      setError(
                        "A source required by the saved plan changed or is unavailable. Review the plan and refresh its cited context first.",
                      );
                      return;
                    }
                    const result = await requestEssayAiAssistance({
                      essayId,
                      mode,
                      taskStamp: workspace.taskStamp,
                      refs: refs.filter((s) => !!s).map(contextReference),
                    });
                    if ("error" in result && result.error) {
                      setError(result.error);
                      return;
                    }
                    if ("data" in result && result.data)
                      setWorkspace(result.data);
                  } catch {
                    setError(
                      "Unable to ask for suggestions. Your edits and writing are unchanged.",
                    );
                  }
                })
              }
            >
              Ask for planning suggestions
            </Button>
            <div className="space-y-4">
              {workspace.requests
                .filter((r) => r.mode === mode)
                .map((request) => {
                  const story =
                      request.mode === "story_matches"
                        ? (request.result as StoryMatches)
                        : null,
                    outline =
                      request.mode === "outline"
                        ? (request.result as ConnectedOutline)
                        : null;
                  return (
                    <div key={request.id} className="space-y-4">
                      {(story?.matches ?? []).map((match, i) => (
                        <article
                          key={i}
                          aria-label={match.title}
                          className="rounded-xl border border-gray-200 p-4"
                        >
                          <h3 className="font-semibold">{match.title}</h3>
                          <p className="mt-2 text-sm leading-6">
                            {match.reason}
                          </p>
                          <p className="mt-2 text-sm leading-6">
                            {match.angle}
                          </p>
                          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                            {match.questions.map((q) => (
                              <li key={q}>{q}</li>
                            ))}
                          </ul>
                          <Citations
                            workspace={workspace}
                            keys={match.sourceKeys}
                          />
                          <ReviewSuggestion
                            workspace={workspace}
                            request={request}
                            index={i}
                            enabled={!hasEdits || !!dirty[`${request.id}:${i}`]}
                            onDirty={(v) =>
                              setDirty((p) => ({
                                ...p,
                                [`${request.id}:${i}`]: v,
                              }))
                            }
                            onPending={setSaving}
                            onSaved={() => {
                              setDirty({});
                              setSaved(true);
                              setWorkspace(null);
                              router.refresh();
                            }}
                          />
                        </article>
                      ))}
                      {outline && (
                        <article
                          aria-label="Suggested connected outline"
                          className="rounded-xl border border-gray-200 p-4"
                        >
                          <h3 className="font-semibold">
                            Suggested connected outline
                          </h3>
                          <p className="mt-2 text-sm leading-6">
                            {outline.purpose}
                          </p>
                          <ol className="mt-3 space-y-4">
                            {outline.beats.map((b, i) => (
                              <li key={i}>
                                <h4 className="text-sm font-medium">
                                  {i + 1}. {b.heading}
                                </h4>
                                <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                                  {b.notes}
                                </p>
                                <Citations
                                  workspace={workspace}
                                  keys={b.sourceKeys}
                                />
                              </li>
                            ))}
                          </ol>
                          <ReviewSuggestion
                            workspace={workspace}
                            request={request}
                            index={0}
                            enabled={!hasEdits || !!dirty[request.id]}
                            onDirty={(v) =>
                              setDirty((p) => ({ ...p, [request.id]: v }))
                            }
                            onPending={setSaving}
                            onSaved={() => {
                              setDirty({});
                              setSaved(true);
                              setWorkspace(null);
                              router.refresh();
                            }}
                          />
                        </article>
                      )}
                      {!!(story?.gaps ?? outline?.gaps)?.length && (
                        <div className="rounded-lg bg-warning-50 p-3 text-sm">
                          <p className="font-medium">
                            Questions and evidence still needed
                          </p>
                          <ul className="mt-2 list-disc space-y-1 pl-5">
                            {(story?.gaps ?? outline?.gaps ?? []).map((g) => (
                              <li key={g}>{g}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger-700">
            {error}
          </p>
        )}
      </section>
    </Modal>
  );
}
export function EssayAiAssistance({ essayId }: { essayId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        AI essay planning
      </Button>
      {open && (
        <AssistanceDialog essayId={essayId} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
