"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/modals/modal";
import { ActionForm, Hidden } from "./action-form";
import { saveStrategySection, reviewStrategySection } from "@/lib/actions/strategy";
import { STRATEGY_SECTIONS, strategySourceKey, strategySourcesCurrent, strategySourcesVisible, type StrategyReference, type StrategySection } from "@/lib/interview/strategy";
import { questionFor, type InterviewWorkspace } from "@/lib/interview/template";

function sourceChoices(data: InterviewWorkspace) {
  return [
    ...data.answers.map(answer => ({ kind: "answer" as const, id: answer.id, revision: answer.revision,
      label: `${data.respondents.find(r => r.id === answer.respondent_user_id)?.name ?? answer.respondent_kind} · ${answer.question_key} · ${questionFor(answer.question_key, answer.respondent_kind)?.text ?? "Interview response"}`,
      text: answer.answer || "No written response", sharing: answer.audience === "family" ? "Family-shared response" : "Respondent and counseling team" })),
    ...data.entries.map(entry => ({ kind: "bank" as const, id: entry.id, revision: entry.revision, label: `${entry.kind === "story" ? "Story" : "Narrative"} · ${entry.title}`,
      text: entry.body, sharing: entry.audience === "family" && entry.review_state === "confirmed" ? "Confirmed and family-shared" : "Student and counseling team" })),
  ];
}
function SectionEditor({ data, sectionKey, entry, onClose, onDirty }: {
  data: InterviewWorkspace; sectionKey: StrategySection["section_key"]; entry?: StrategySection;
  onClose: () => void; onDirty: (dirty: boolean) => void;
}) {
  const id = useId(), [dirty, setDirty] = useState(false), [closeAttempt, setCloseAttempt] = useState(false);
  const section = STRATEGY_SECTIONS.find(s => s.key === sectionKey)!;
  const choices = sourceChoices(data);
  const missing = entry?.evidence.filter(ref => !choices.some(c => strategySourceKey(c) === strategySourceKey(ref))) ?? [];
  function close() { if (dirty) setCloseAttempt(true); else onClose(); }
  return <Modal open trapFocus onClose={close} title={`Edit ${section.title.toLowerCase()}`} description={section.description} size="lg" footer={<>
    {closeAttempt && <><p role="status" className="mr-auto text-sm text-warning-800">Your edits have not been saved.</p><Button variant="danger" onClick={() => { onDirty(false); onClose(); }}>Discard edits</Button></>}
    <Button variant="outline" onClick={close}>Cancel</Button>
  </>}>
    <ActionForm action={saveStrategySection} label="Save section" onDirty={changed => { setDirty(changed); onDirty(changed); }} onSaved={onClose}>
      <Hidden name="student_id" value={data.student.id} /><Hidden name="id" value={entry?.id ?? ""} />
      <Hidden name="section_key" value={sectionKey} /><Hidden name="revision" value={entry?.revision ?? 0} />
      <Textarea id={`${id}-body`} label="Counselor synthesis" name="body" required maxLength={12000} rows={7} defaultValue={entry?.body ?? ""} placeholder="Connect what you have learned, distinguish each person's perspective, and note what still needs discussion." />
      <details className="rounded-lg border border-gray-200 p-3"><summary className="cursor-pointer text-sm font-medium">Link interview responses, stories or narratives</summary>
        <p className="mt-3 text-xs text-gray-600">Links retain attribution and use the latest saved source. They do not copy original source text or change its sharing. Select up to 20.</p>
        <div className="mt-3 max-h-72 space-y-3 overflow-y-auto">
          {choices.map(source => <label key={strategySourceKey(source)} className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="source_key" value={strategySourceKey(source)} defaultChecked={entry?.evidence.some(ref => strategySourceKey(ref) === strategySourceKey(source)) ?? false} className="mt-1" />
            <span className="min-w-0"><span className="block font-medium">{source.label}</span><span className="mt-1 block text-xs text-gray-500">{source.sharing}</span><span className="mt-1 block whitespace-pre-wrap text-gray-600">{source.text.slice(0, 240)}{source.text.length > 240 ? "…" : ""}</span></span>
          </label>)}
          {missing.map(ref => <label key={strategySourceKey(ref)} className="flex items-start gap-3 text-sm"><input type="checkbox" name="source_key" value={strategySourceKey(ref)} defaultChecked /><span>Source no longer available — remove this link before saving.</span></label>)}
          {!choices.length && <p className="text-sm text-gray-500">Saved responses and stories will appear here. You can start with your own notes.</p>}
        </div>
      </details>
      {entry && sectionKey !== "counselor_notes" ? <Select id={`${id}-sharing`} label="Share this section with" name="publication_state" defaultValue={entry.publication_state} options={[{ value: "draft", label: "Counseling team only — draft" }, { value: "shared", label: "Student and counseling team" }]} /> : <>
        <Hidden name="publication_state" value="draft" /><p className="rounded-lg bg-primary-50 p-3 text-sm">{sectionKey === "counselor_notes" ? "Private counselor notes always stay with the counseling team." : "Start with a counselor-only draft. Review it, then explicitly share it with the student."}</p>
      </>}
      <p className="text-xs leading-5 text-gray-600">Check the written synthesis before sharing: it must not repeat private parent information. A section linked to a private parent response cannot be shared with the student. Saving updates the linked sources, asks the student to review again, and stops parent access until the student approves. Earlier student feedback is kept.</p>
    </ActionForm>
  </Modal>;
}

function StudentReview({ data, entry, onDirty }: { data: InterviewWorkspace; entry: StrategySection; onDirty: (dirty: boolean) => void }) {
  const id = useId(), current = strategySourcesCurrent(entry.evidence, data);
  const [review, setReview] = useState(current ? entry.student_review : "discuss");
  const familyReady = current && strategySourcesVisible(entry.evidence, data, "family");
  return <details className="mt-5 rounded-lg border border-primary-100 p-4"><summary className="cursor-pointer text-sm font-medium">Review and parent sharing</summary>
    <ActionForm action={reviewStrategySection} label="Save my review" onDirty={onDirty} className="mt-4">
      <Hidden name="student_id" value={data.student.id} /><Hidden name="id" value={entry.id} /><Hidden name="revision" value={entry.revision} />
      <Select id={`${id}-review`} label="Does this reflect your perspective?" name="student_review" value={review} onChange={event => setReview(event.target.value as typeof review)} options={[{ value: "pending", label: "I am still reviewing" }, { value: "accurate", label: "This feels accurate" }, { value: "discuss", label: "I would like to discuss a correction" }]} />
      <Textarea id={`${id}-note`} label="Your review note" name="student_note" maxLength={3000} rows={3} defaultValue={entry.student_note} placeholder="What should your counselor understand or adjust?" />
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="family_shared" value="yes" defaultChecked={familyReady && entry.family_shared} disabled={!familyReady || review !== "accurate"} className="mt-1" /><span>Allow my parents or guardians to see this section and my review note.</span></label>
      <p className="text-xs leading-5 text-gray-600">Parent sharing applies to this section and your note together. You can turn it off at any time. Your counselor cannot approve it for you. Changes to the brief or linked sources require a fresh review.</p>
      {!familyReady && <p className="text-xs text-warning-800">{current ? "A linked response, story or narrative is not currently shared with your family. Share and confirm those sources first, then ask your counselor to refresh the links." : "A linked source changed. Your counselor needs to refresh the section before you can confirm or share it. You can still request a discussion."}</p>}
    </ActionForm>
  </details>;
}

export function StrategyBrief({ data, onSource, onDirty, hasUnsaved }: { data: InterviewWorkspace; onSource: (source: StrategyReference) => void; onDirty: (key: string, dirty: boolean) => void; hasUnsaved: boolean }) {
  const [editor, setEditor] = useState<StrategySection["section_key"] | null>(null);
  const choices = sourceChoices(data);
  const definitions = STRATEGY_SECTIONS.filter(def => data.kind === "staff" || data.strategySections.some(row => row.section_key === def.key));
  return <section aria-labelledby="strategy-brief-heading" className="space-y-5">
    <div><h2 id="strategy-brief-heading" className="text-xl font-semibold">Counselor strategy brief</h2><p className="mt-2 max-w-4xl text-sm leading-6 text-gray-600">{data.kind === "staff" ? "Bring the interviews and stories together into a counseling plan. Drafts stay with your team; share each section with the student when ready. The student controls parent sharing." : data.kind === "student" ? "Your counselor's working understanding of your priorities, experiences and next steps. Review each shared section, suggest corrections, and choose what your parents can see." : "Sections your student has reviewed and chosen to share with family. Private counselor drafts and unshared interview responses are not included."}</p></div>
    {!data.strategySections.length && <p className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-600">{data.kind === "staff" ? "Start with one section below. A useful brief can be short and can change as you learn more." : "No strategy sections have been shared with you yet."}</p>}
    {definitions.map(def => {
      const entry = data.strategySections.find(row => row.section_key === def.key);
      const current = entry ? strategySourcesCurrent(entry.evidence, data) : true;
      const studentVisible = entry ? strategySourcesVisible(entry.evidence, data, "student") : true;
      return <article key={def.key} aria-labelledby={`strategy-title-${def.key}`} className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id={`strategy-title-${def.key}`} className="font-semibold">{def.title}</h3><p className="mt-1 text-xs leading-5 text-gray-500">{def.description}</p></div>
          {data.canCounsel && <Button size="sm" variant="outline" onClick={() => setEditor(def.key)}>{entry ? "Edit section" : "Start draft"}</Button>}</div>
        {entry && <>
          <p className="mt-4 text-xs font-medium text-primary-700">{entry.publication_state === "draft" ? "Counselor-only draft" : !studentVisible ? "Student access paused · Review linked source sharing" : entry.family_shared && entry.student_review === "accurate" && current && strategySourcesVisible(entry.evidence, data, "family") ? "Student-approved · Shared with parents" : "Shared with student · Parents cannot see this section"}</p>
          {!current && <p className="mt-2 text-sm text-warning-800">Linked sources changed or became unavailable. Review and refresh this section. Parent access is paused.</p>}
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-gray-800">{entry.body}</p>
          {entry.evidence.length > 0 && <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Supporting sources ({entry.evidence.length})</summary><ul className="mt-3 space-y-3">{entry.evidence.map(ref => {
            const source = choices.find(c => strategySourceKey(c) === strategySourceKey(ref));
            return <li key={strategySourceKey(ref)} className="rounded-lg bg-gray-50 p-3 text-sm">{source ? <>
              <Button size="sm" variant="ghost" disabled={hasUnsaved} className="max-w-full whitespace-normal text-left" onClick={() => onSource(ref)}>{source.label}</Button><p className="mt-1 text-xs text-gray-500">{source.sharing}{source.revision !== ref.revision ? " · Updated since linked" : ""}</p>
            </> : <p className="text-gray-500">Source is no longer available.</p>}</li>;
          })}</ul></details>}
          {entry.publication_state === "shared" && <p className="mt-4 text-xs text-gray-500">Student review: {!current && entry.student_review === "accurate" ? "Review needed after source changes" : entry.student_review === "accurate" ? "Feels accurate" : entry.student_review === "discuss" ? "Discussion requested" : "Awaiting review"}{entry.reviewed_at ? ` · ${new Date(entry.reviewed_at).toLocaleDateString()}` : ""}</p>}
          {entry.student_note && <div className="mt-3 rounded-lg bg-primary-50 p-3"><p className="text-xs font-medium text-primary-900">{entry.student_review === "pending" ? "Earlier student feedback" : "Student review note"}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{entry.student_note}</p></div>}
          {data.kind === "student" && <StudentReview key={`${entry.id}:${entry.revision}`} data={data} entry={entry} onDirty={dirty => onDirty(`strategy:${entry.id}`, dirty)} />}
        </>}
      </article>;
    })}
    {editor && <SectionEditor data={data} sectionKey={editor} entry={data.strategySections.find(s => s.section_key === editor)} onDirty={dirty => onDirty("strategy-editor", dirty)} onClose={() => { onDirty("strategy-editor", false); setEditor(null); }} />}
  </section>;
}
