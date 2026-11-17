"use client";

import { combinedEssayProvenance } from "@/lib/ai/essay-context";

import { EssayAiAssistance } from "./essay-ai-assistance";
import {
  EssaySourceCitations,
  EssaySourceReview,
} from "./essay-source-citations";
import { useId, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/modals/modal";
import { ActionForm, Hidden } from "@/components/interview/action-form";
import { saveEssayOutline } from "@/lib/actions/essay-drafting";
import {
  importedCounselorOutline,
  isCounselorOutline,
  type EssayDraftingData,
  type OutlineContent,
} from "@/lib/essays/drafting";
import { essayPlanningPath, PLAN_APPROACH_LABELS } from "@/lib/essays/planning";

const linkClass =
  "text-sm font-medium text-primary-700 underline underline-offset-2";
const cardClass = "rounded-xl border border-gray-200 bg-white p-4";
function bankPath(data: EssayDraftingData) {
  return data.surface === "staff"
    ? `/students/${data.studentId}/interview?view=bank`
    : data.surface === "family"
      ? `/family-interview/${data.studentId}?view=bank`
      : "/student-interview?view=bank";
}

function OutlineEditor({
  data: incomingData,
  counselorOutline,
  onClose,
}: {
  data: EssayDraftingData;
  counselorOutline?: unknown;
  onClose: () => void;
}) {
  const [data] = useState(incomingData); // Keep the displayed revisions until this editor closes.
  const id = useId(),
    [content, setContent] = useState<OutlineContent>(
      data.outline?.content ?? {
        purpose: data.row.plan?.angle.slice(0, 2000) ?? "",
        beats: [],
      },
    );
  const [review, setReview] = useState(
      data.outlineStale ? "draft" : (data.outline?.review_state ?? "draft"),
    ),
    [dirty, setDirty] = useState(false),
    [pending, setPending] = useState(false),
    [discard, setDiscard] = useState(false);
  const provenance = combinedEssayProvenance(
    data.outline?.provenance,
    data.row.plan?.provenance,
  );
  const [aiRefs, setAiRefs] = useState(provenance?.refs ?? []),
    [aiFamilyReady, setAiFamilyReady] = useState(
      provenance?.familyReady ?? true,
    );
  const student = data.surface === "student";
  function change(next: OutlineContent) {
    setContent(next);
    setDirty(true);
  }
  function close() {
    if (pending) return;
    if (dirty) setDiscard(true);
    else onClose();
  }
  function move(index: number, direction: number) {
    const beats = [...content.beats];
    [beats[index], beats[index + direction]] = [
      beats[index + direction],
      beats[index],
    ];
    change({ ...content, beats });
  }
  const canImport =
    data.surface === "staff" && isCounselorOutline(counselorOutline);
  return (
    <Modal
      open
      trapFocus
      size="lg"
      title="Edit essay outline"
      description="Plan what each section will add. Saving the outline never replaces essay writing."
      onClose={close}
      footer={
        <>
          {discard && (
            <>
              <p role="status" className="mr-auto text-sm text-warning-800">
                Your outline edits have not been saved.
              </p>
              <Button variant="danger" disabled={pending} onClick={onClose}>
                Discard outline edits
              </Button>
            </>
          )}
          <Button variant="outline" disabled={pending} onClick={close}>
            Cancel
          </Button>
        </>
      }
    >
      <ActionForm
        action={saveEssayOutline}
        label="Save outline"
        onDirty={setDirty}
        externalDirty={dirty}
        onPendingChange={setPending}
        onSaved={onClose}
      >
        <Hidden name="essay_id" value={data.essayId} />
        <Hidden name="revision" value={data.outline?.revision ?? 0} />
        <Hidden name="ai_source_refs" value={JSON.stringify(aiRefs)} />
        <EssaySourceReview
          essayId={data.essayId}
          provenance={provenance}
          onChange={(refs, ready) => {
            setAiRefs(refs);
            setAiFamilyReady(ready);
            setDirty(true);
          }}
        />
        <Hidden name="content" value={JSON.stringify(content)} />
        <Hidden name="context" value={JSON.stringify(data.context)} />
        {canImport && (
          <div className="rounded-lg bg-primary-50 p-3 text-sm">
            <p>
              Existing counselor outline assistance is available. Importing
              creates an editable working outline; review its details and
              connect real material before saving.
            </p>
            <Button
              type="button"
              className="mt-2"
              variant="outline"
              size="sm"
              disabled={dirty}
              onClick={() => {
                const imported = importedCounselorOutline(
                  counselorOutline,
                  Array.from({ length: 8 }, () => crypto.randomUUID()),
                );
                if (imported) change(imported);
              }}
            >
              Use counselor outline
            </Button>
            {dirty && (
              <p className="mt-2 text-xs">
                Save or discard your edits before importing.
              </p>
            )}
          </div>
        )}
        <Textarea
          id={`${id}-purpose`}
          label="What should this essay reveal?"
          rows={3}
          maxLength={2000}
          value={content.purpose}
          onChange={(e) => change({ ...content, purpose: e.target.value })}
        />
        <div className="space-y-4" aria-label="Outline sections">
          {content.beats.map((beat, index) => (
            <fieldset
              key={beat.id}
              className="space-y-3 rounded-lg border border-gray-200 p-3"
            >
              <legend className="px-1 text-sm font-medium">
                Section {index + 1}
              </legend>
              <Input
                id={`${id}-${beat.id}-heading`}
                label={`Section ${index + 1} heading`}
                maxLength={160}
                value={beat.heading}
                onChange={(e) =>
                  change({
                    ...content,
                    beats: content.beats.map((b) =>
                      b.id === beat.id ? { ...b, heading: e.target.value } : b,
                    ),
                  })
                }
              />
              <Textarea
                id={`${id}-${beat.id}-notes`}
                label={`Section ${index + 1} notes`}
                rows={3}
                maxLength={3000}
                value={beat.notes}
                onChange={(e) =>
                  change({
                    ...content,
                    beats: content.beats.map((b) =>
                      b.id === beat.id ? { ...b, notes: e.target.value } : b,
                    ),
                  })
                }
              />
              <fieldset className="space-y-2">
                <legend className="mb-2 text-xs font-medium">
                  Material supporting this section
                </legend>
                {data.row.entryIds.map((entryId) => {
                  const entry = data.entries.find((e) => e.id === entryId);
                  if (!entry) return null;
                  return (
                    <label
                      key={entryId}
                      className="flex items-start gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={beat.entry_ids.includes(entryId)}
                        onChange={(e) =>
                          change({
                            ...content,
                            beats: content.beats.map((b) =>
                              b.id === beat.id
                                ? {
                                    ...b,
                                    entry_ids: e.target.checked
                                      ? [...b.entry_ids, entryId]
                                      : b.entry_ids.filter(
                                          (v) => v !== entryId,
                                        ),
                                  }
                                : b,
                            ),
                          })
                        }
                      />
                      <span>{entry.title}</span>
                    </label>
                  );
                })}
                {beat.entry_ids
                  .filter((entryId) => !data.row.entryIds.includes(entryId))
                  .map((entryId) => (
                    <label
                      key={entryId}
                      className="flex items-start gap-2 text-sm text-warning-800"
                    >
                      <input
                        type="checkbox"
                        checked
                        onChange={() =>
                          change({
                            ...content,
                            beats: content.beats.map((b) =>
                              b.id === beat.id
                                ? {
                                    ...b,
                                    entry_ids: b.entry_ids.filter(
                                      (v) => v !== entryId,
                                    ),
                                  }
                                : b,
                            ),
                          })
                        }
                      />
                      <span>
                        {data.entries.find((e) => e.id === entryId)?.title ??
                          "Previously connected material"}{" "}
                        — remove this reference or reconnect it on the planning
                        board.
                      </span>
                    </label>
                  ))}
                {!data.row.entryIds.length && (
                  <p className="text-xs text-gray-500">
                    No material is connected yet. Research responses can use
                    notes without a personal story.
                  </p>
                )}
              </fieldset>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={`Move section ${index + 1} up`}
                >
                  Move up
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={index === content.beats.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`Move section ${index + 1} down`}
                >
                  Move down
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    change({
                      ...content,
                      beats: content.beats.filter((b) => b.id !== beat.id),
                    })
                  }
                  aria-label={`Remove section ${index + 1}`}
                >
                  Remove section
                </Button>
              </div>
            </fieldset>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={content.beats.length >= 12}
            onClick={() =>
              change({
                ...content,
                beats: [
                  ...content.beats,
                  {
                    id: crypto.randomUUID(),
                    heading: "",
                    notes: "",
                    entry_ids: [],
                  },
                ],
              })
            }
          >
            Add section
          </Button>
          {!content.beats.length && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                change({
                  ...content,
                  beats: ["Opening", "Development", "Reflection"].map(
                    (heading) => ({
                      id: crypto.randomUUID(),
                      heading,
                      notes: "",
                      entry_ids: [],
                    }),
                  ),
                })
              }
            >
              Use three-part starter
            </Button>
          )}
        </div>
        {student ? (
          <>
            <Select
              id={`${id}-review`}
              label="Outline review"
              name="review"
              value={review}
              onChange={(e) => setReview(e.target.value as typeof review)}
              options={[
                { value: "draft", label: "Still working" },
                {
                  value: "confirmed",
                  label: "I reviewed this outline and its material",
                },
                { value: "revisit", label: "I want to revisit this outline" },
              ]}
            />
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="family_shared"
                value="yes"
                defaultChecked={
                  !data.outlineStale &&
                  data.familyReady &&
                  data.outline?.family_shared
                }
                disabled={
                  !aiFamilyReady || !data.familyReady || review !== "confirmed"
                }
              />
              <span>Allow my parents or guardians to see this outline.</span>
            </label>
            {(!aiFamilyReady || !data.familyReady) && (
              <p className="text-xs text-warning-800">
                Share the essay, reviewed plan and every connected story or
                narrative with family before sharing this outline.
              </p>
            )}
          </>
        ) : (
          <>
            <Hidden name="review" value="draft" />
            <p className="rounded-lg bg-primary-50 p-3 text-sm">
              The student and counseling team can see this working outline.
              Counselor saves require a fresh student review and pause parent
              access.
            </p>
          </>
        )}
        <p className="text-xs text-gray-500">
          Reviewing an outline is separate from essay approval. Save changes to
          the plan or sources first; the outline records the versions you see
          here.
        </p>
      </ActionForm>
    </Modal>
  );
}

export function EssayWritingContext({
  data,
  counselorOutline,
}: {
  data: EssayDraftingData;
  counselorOutline?: unknown;
}) {
  const [editing, setEditing] = useState(false),
    family = data.surface === "family";
  const planPath = `${essayPlanningPath(data.studentId, data.surface)}?essay=${data.essayId}`;
  return (
    <div className="space-y-4" aria-label="Connected writing workspace">
      {data.canEdit && data.surface !== "family" && (
        <EssayAiAssistance essayId={data.essayId} />
      )}
      {data.decisionHref && (
        <p className="text-sm">
          Post-decision letter ·{" "}
          <Link className={linkClass} href={data.decisionHref}>
            Back to decision and enrollment
          </Link>
        </p>
      )}
      <section className={cardClass} aria-labelledby="writing-plan-heading">
        <div className="flex flex-wrap justify-between gap-3">
          <h2 id="writing-plan-heading" className="font-semibold">
            Writing plan
          </h2>
          <Link href={planPath} className={linkClass}>
            Open essay planning board
          </Link>
        </div>
        {data.row.plan ? (
          <>
            <p className="mt-3 text-xs text-gray-500">
              {PLAN_APPROACH_LABELS[data.row.plan.approach]} ·{" "}
              {data.row.plan.review_state === "confirmed"
                ? "Student reviewed"
                : "Needs student review"}
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
              {data.row.plan.angle ||
                "Add a response angle on the planning board."}
            </p>
            <EssaySourceCitations provenance={data.row.plan.provenance} />
          </>
        ) : (
          <p className="mt-3 text-sm text-gray-500">
            {family
              ? "No planning note has been shared with family."
              : "Choose a response angle on the planning board."}
          </p>
        )}
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Assigned prompt and limits
          </summary>
          <p className="mt-2 whitespace-pre-wrap break-words leading-6">
            {data.row.promptText || "Prompt not recorded."}
          </p>
          <p className="mt-2 text-xs text-gray-500">
            {data.row.wordLimit
              ? `${data.row.wordLimit} words`
              : "Word limit not recorded"}
            {data.row.characterLimit
              ? ` · ${data.row.characterLimit} characters`
              : ""}
          </p>
        </details>
        {data.requirementsChanged && (
          <p className="mt-3 rounded-lg bg-warning-50 p-3 text-sm text-warning-800">
            Published requirements changed. Compare them with the preserved
            assignment on the planning board before finalizing.
          </p>
        )}
        {!family && (data.sourcesStale || data.materialNeedsReview) && (
          <p className="mt-3 rounded-lg bg-warning-50 p-3 text-sm text-warning-800">
            The connected material needs another review. Confirm the bank
            entries and response plan before finalizing this essay.
          </p>
        )}
      </section>
      <section
        className={cardClass}
        aria-label="Stories and narratives connected to this essay"
      >
        <div className="flex flex-wrap justify-between gap-3">
          <h2 className="font-semibold">Connected material</h2>
          <Link href={bankPath(data)} className={linkClass}>
            Open story and narrative bank
          </Link>
        </div>
        <div className="mt-3 space-y-3">
          {data.entries.map((entry) => (
            <details
              key={entry.id}
              className="rounded-lg border border-gray-100 p-3"
            >
              <summary className="cursor-pointer break-words text-sm font-medium">
                <span>{entry.title}</span>{" "}
                <span className="text-xs font-normal text-gray-500">
                  · {entry.kind} ·{" "}
                  {entry.review_state === "confirmed"
                    ? "Student confirmed"
                    : "Needs student review"}
                </span>
              </summary>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                {entry.body}
              </p>
              {entry.reflection && (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-600">
                  {entry.reflection}
                </p>
              )}
              <Link
                href={`${bankPath(data)}#interview-bank-${entry.id}`}
                className={`${linkClass} mt-2 inline-block`}
              >
                Open this {entry.kind}
              </Link>
            </details>
          ))}
          {!data.entries.length && (
            <p className="text-sm text-gray-500">
              {family
                ? "No connected material is currently shared with family."
                : "Connect stories or narratives on the planning board. Research responses can use an angle without a personal story."}
            </p>
          )}
        </div>
      </section>
      <section className={cardClass} aria-labelledby="writing-outline-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id="writing-outline-heading" className="font-semibold">
            Essay outline
          </h2>
          {data.canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
            >
              {data.outline ? "Edit outline" : "Start outline"}
            </Button>
          )}
        </div>
        {data.outlineStale && (
          <p className="mt-3 rounded-lg bg-warning-50 p-3 text-sm text-warning-800">
            The plan, prompt or source material changed. Review and save the
            outline again before finalizing; parent access is paused.
          </p>
        )}
        {data.outline ? (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge
                variant={
                  data.outline.review_state === "confirmed" &&
                  !data.outlineStale
                    ? "success"
                    : "warning"
                }
              >
                {data.outline.review_state === "confirmed" && !data.outlineStale
                  ? "Outline reviewed"
                  : "Needs student review"}
              </Badge>
              {!family && (
                <span className="text-xs text-gray-500">
                  {data.outline.family_shared &&
                  !data.outlineStale &&
                  data.familyReady &&
                  data.outline.provenance?.familyReady !== false
                    ? "Outline shared with parents"
                    : "Outline: student and counseling team"}
                </span>
              )}
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
              {data.outline.content.purpose || "Purpose not recorded."}
            </p>
            <EssaySourceCitations provenance={data.outline.provenance} />
            <ol className="mt-4 space-y-4">
              {data.outline.content.beats.map((beat, i) => (
                <li key={beat.id}>
                  <h3 className="break-words text-sm font-medium">
                    {i + 1}. {beat.heading || "Untitled section"}
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">
                    {beat.notes || "Add notes for this section."}
                  </p>
                  {beat.entry_ids.length > 0 && (
                    <p className="mt-2 text-xs text-gray-500">
                      Material:{" "}
                      {beat.entry_ids
                        .map(
                          (id) =>
                            data.entries.find((e) => e.id === id)?.title ??
                            "Connection changed — review the plan",
                        )
                        .join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="mt-3 text-sm text-gray-500">
            {family
              ? "No outline has been shared with family."
              : "Break the response into sections and connect each section to the material it uses."}
          </p>
        )}
      </section>
      {editing && data.context && (
        <OutlineEditor
          data={data}
          counselorOutline={counselorOutline}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
