"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/modals/modal";
import { ActionForm, Hidden } from "@/components/interview/action-form";
import {
  loadEssayCoaching,
  publishEssayCoaching,
  requestEssayCoaching,
} from "@/lib/actions/essay-coaching";
import {
  contextKey,
  contextReference,
  contextSourceLabel,
} from "@/lib/ai/student-context";
import type { CoachingWorkspace } from "@/lib/ai/essay-coaching";
import type { SavedEssayVersion } from "@/lib/essays/drafting";

export function EssaySavedCoaching({
  essayId,
  versions,
}: {
  essayId: string;
  versions: SavedEssayVersion[];
}) {
  const id = useId(),
    router = useRouter(),
    [open, setOpen] = useState(false),
    [versionId, setVersionId] = useState(versions[0]?.id ?? ""),
    [workspace, setWorkspace] = useState<CoachingWorkspace | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [review, setReview] = useState<{ requestId: string; index: number } | null>(
      null,
    ),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false),
    [discard, setDiscard] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, start] = useTransition();
  function close() {
    if (pending || saving) return;
    if (dirty) {
      setDiscard(true);
      return;
    }
    setOpen(false);
    setReview(null);
    setWorkspace(null);
    setSelected([]);
    setNotice("");
    setError("");
  }
  function load() {
    setError("");
    start(async () => {
      try {
        const r = await loadEssayCoaching(essayId, versionId);
        if ("error" in r && r.error) setError(r.error);
        else if ("data" in r && r.data) {
          setWorkspace(r.data);
          setSelected([]);
          setReview(null);
          setNotice("");
        }
      } catch {
        setError("Unable to load coaching. Your writing is unchanged.");
      }
    });
  }
  function ask() {
    if (!workspace) return;
    setError("");
    start(async () => {
      try {
        const refs = workspace.sources
          .filter((s) => selected.includes(contextKey(s)))
          .map(contextReference);
        const r = await requestEssayCoaching({
          essayId,
          versionId: workspace.version.id,
          taskStamp: workspace.taskStamp,
          refs,
        });
        if ("error" in r && r.error) setError(r.error);
        else if ("data" in r && r.data) {
          setWorkspace(r.data);
          setNotice("");
        }
      } catch {
        setError(
          "Coaching is unavailable. Your writing and selections are unchanged.",
        );
      }
    });
  }
  const disabled = pending || saving || dirty;
  return (
    <>
      <Button
        icon="ai"
        size="sm"
        variant="outline"
        onClick={() => {
          setVersionId(versions[0]?.id ?? "");
          setOpen(true);
        }}
      >
        Saved-version coaching
      </Button>
      {open && (
        <Modal
          open
          trapFocus
          size="lg"
          title="Saved-version essay coaching"
          description="Choose a saved draft and the student context to review. Your working writing stays separate."
          onClose={close}
          footer={
            <>
              {discard && (
                <p className="text-sm text-warning-800">
                  Your feedback edits have not been saved.{" "}
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setDirty(false);
                      setDiscard(false);
                      setReview(null);
                    }}
                  >
                    Discard review edits
                  </Button>
                </p>
              )}
              <Button
                variant="secondary"
                onClick={close}
                disabled={pending || saving}
              >
                Close
              </Button>
            </>
          }
        >
          <div
            className="space-y-4"
            aria-label="Saved-version coaching controls"
          >
            <p className="text-sm">
              AI offers observations and questions, never replacement essay
              text. You decide which feedback is useful and write revisions
              yourself. Suggestions are private to you. Adding reviewed feedback
              uses the existing student and counseling-team thread; parents
              cannot see feedback or saved draft history.
            </p>
            <label htmlFor={`${id}-version`} className="block text-sm">
              Saved draft version
            </label>
            <Select
              id={`${id}-version`}
              value={versionId}
              disabled={disabled}
              options={
                versions.length
                  ? versions.map((v) => ({
                      value: v.id,
                      label: `Version ${v.number}${v.latestSubmitted ? " · latest submitted" : v.submitted ? " · submitted" : ""}`,
                    }))
                  : [{ value: "", label: "No saved versions" }]
              }
              onChange={(e) => {
                setVersionId(e.target.value);
                setWorkspace(null);
                setSelected([]);
                setReview(null);
                setNotice("");
                setError("");
              }}
            />
            {!versions.length && (
              <p className="text-sm">
                Save a draft version in the essay editor first. Autosaved
                working text is not a saved version.
              </p>
            )}
            <Button
              icon="refresh"
              variant="outline"
              onClick={load}
              loading={pending}
              disabled={disabled || !versionId}
            >
              {workspace
                ? "Refresh version and context"
                : "Review version and context"}
            </Button>
            {dirty && (
              <p className="text-sm">
                Save or discard your feedback edits before changing the version,
                sources or request.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-danger-700">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm text-success-800">
                {notice}
              </p>
            )}
            {workspace && (
              <>
                <p className="text-sm font-medium">
                  Reviewing saved version {workspace.version.number}
                  {workspace.version.number < workspace.latestVersionNumber
                    ? ` · An earlier version; latest saved version is ${workspace.latestVersionNumber}`
                    : ""}
                  . Later saves and unsaved writing are not sent.
                </p>
                <details>
                  <summary className="cursor-pointer text-sm font-medium">
                    Preview saved draft and assigned prompt
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    {workspace.prompt.text}
                  </p>
                  <p className="text-xs">
                    {workspace.prompt.wordLimit ?? "No declared"} word limit ·{" "}
                    {workspace.prompt.characterLimit ?? "No declared"} character
                    limit
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap break-words rounded border p-3 font-sans text-sm">
                    {workspace.version.body || "This saved draft is empty."}
                  </pre>
                </details>
                <fieldset
                  disabled={disabled}
                  className="space-y-2 rounded border p-3"
                >
                  <legend className="px-1 text-sm font-medium">
                    Choose context to send ({selected.length}/20)
                  </legend>
                  <p className="text-xs">
                    Only this saved version, the assigned prompt and checked
                    student context are sent. Parent interviews and private
                    counselor notes are excluded. Sources are never silently
                    truncated.
                  </p>
                  {workspace.sources.map((s) => (
                    <div key={contextKey(s)}>
                      <label className="flex gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selected.includes(contextKey(s))}
                          onChange={(e) =>
                            setSelected((p) =>
                              e.target.checked
                                ? [...p, contextKey(s)]
                                : p.filter((k) => k !== contextKey(s)),
                            )
                          }
                        />
                        {contextSourceLabel(s, "student")}
                      </label>
                      <details className="ml-6 text-xs">
                        <summary className="cursor-pointer">
                          Preview source · revision {s.revision}
                        </summary>
                        <p className="whitespace-pre-wrap">{s.text}</p>
                      </details>
                    </div>
                  ))}
                  {!workspace.sources.length && (
                    <p className="text-sm">
                      Save an interview response or confirm story-bank material
                      before selecting coaching context.
                    </p>
                  )}
                </fieldset>
                <Button
                  icon="ai"
                  onClick={ask}
                  loading={pending}
                  disabled={
                    disabled || selected.length < 1 || selected.length > 20
                  }
                >
                  Ask for saved-version coaching
                </Button>
                {workspace.requests.map((req) => (
                  <section
                    key={req.id}
                    className="space-y-3 rounded border p-3"
                    aria-label="Private coaching suggestions"
                  >
                    <p className="text-sm font-medium">
                      Private review · saved version {workspace.version.number}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">
                      {req.result.assessment}
                    </p>
                    {req.result.suggestions.map((s, index) => (
                      <article key={index} className="space-y-2 border-t pt-3">
                        <h3 className="text-sm font-semibold">
                          {s.category.replaceAll("_", " ")}
                        </h3>
                        {s.quote ? (
                          <blockquote className="border-l-2 pl-3 text-sm whitespace-pre-wrap">
                            {s.quote}
                            <cite className="block text-xs not-italic">
                              Saved version {workspace.version.number}
                            </cite>
                          </blockquote>
                        ) : (
                          <p className="text-xs">Whole saved draft</p>
                        )}
                        <p className="text-sm">{s.observation}</p>
                        <p className="text-sm font-medium">{s.question}</p>
                        <ul
                          aria-label="Coaching source citations"
                          className="text-xs"
                        >
                          {s.sourceKeys.map((k) => {
                            const c = workspace.citations.find(
                              (c) => c.key === k,
                            );
                            return c ? (
                              <li key={k}>
                                <Link
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary-700 underline"
                                  href={c.href}
                                >
                                  {c.label}
                                </Link>{" "}
                                · revision {c.revision}
                              </li>
                            ) : null;
                          })}
                        </ul>
                        {req.used.includes(index) ? (
                          <p className="text-sm">
                            Added to the feedback thread.
                          </p>
                        ) : review?.requestId === req.id &&
                          review.index === index ? (
                          <ActionForm
                            action={publishEssayCoaching}
                            label="Add reviewed feedback"
                            externalDirty
                            onDirty={setDirty}
                            onPendingChange={setSaving}
                            onSaved={() => {
                              setDirty(false);
                              setReview(null);
                              setNotice(
                                "Reviewed feedback added for the student and counseling team. Essay writing and parent sharing are unchanged.",
                              );
                              setWorkspace((w) =>
                                w
                                  ? {
                                      ...w,
                                      requests: w.requests.map((r) =>
                                        r.id === req.id
                                          ? { ...r, used: [...r.used, index] }
                                          : r,
                                      ),
                                    }
                                  : w,
                              );
                              router.refresh();
                            }}
                          >
                            <Hidden name="essay_id" value={essayId} />
                            <Hidden
                              name="version_id"
                              value={workspace.version.id}
                            />
                            <Hidden name="request_id" value={req.id} />
                            <Hidden name="index" value={index} />
                            <label
                              className="block text-sm"
                              htmlFor={`${id}-feedback`}
                            >
                              Feedback to add
                            </label>
                            <Textarea
                              id={`${id}-feedback`}
                              name="body"
                              required
                              maxLength={12000}
                              rows={6}
                              defaultValue={`${s.observation}\n\n${s.question}`}
                            />
                            <p className="text-xs">
                              Edit these questions before adding them. The exact
                              saved-version quote and every selected input
                              source stay attached. This does not approve,
                              submit or share the essay. Counselors can use the
                              existing feedback controls to assign a revision
                              task.
                            </p>
                          </ActionForm>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={disabled}
                            onClick={() => {
                              setReview({ requestId: req.id, index });
                              setDirty(true);
                              setNotice("");
                            }}
                          >
                            Review and edit feedback
                          </Button>
                        )}
                      </article>
                    ))}
                    {req.result.gaps.length > 0 && (
                      <>
                        <p className="text-sm font-medium">
                          Questions and evidence still needed
                        </p>
                        <ul className="list-disc pl-5 text-sm">
                          {req.result.gaps.map((g, i) => (
                            <li key={i}>{g}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </section>
                ))}
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
