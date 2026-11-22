"use client";
import { ArrowLink } from "@/components/ui/arrow-link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { CollegePromptReviewRow } from "@/lib/db/queries";
import { PROMPT_COVERAGES, PROMPT_REQUIREMENTS, PROMPT_TEXT_KINDS, type PromptReviewInput } from "@/lib/colleges/prompt-review";
import { PROMPT_COVERAGE_LABELS } from "@/lib/colleges/workspace";
import { supplementSources, type SourceCheck } from "@/lib/colleges/prompt-sources";
import { fetchOfficialSupplement, publishCollegePromptReview, saveCollegePromptReview } from "@/lib/actions/college-prompts";
import { BOSTON_COLLEGE_SCORECARD_ID, BOSTON_COLLEGE_SUPPLEMENT_URL, importBostonCollegeSupplement } from "@/lib/colleges/prompt-import";

export function PromptReviewEditor({ review, canEdit, canPublish, retrievalEnabled, sourceCheck }: { retrievalEnabled: boolean; sourceCheck: SourceCheck | null; review: CollegePromptReviewRow; canEdit: boolean; canPublish: boolean }) {
  const router = useRouter();
  const [content, setContent] = useState<PromptReviewInput>(() => ({
    coverage: review.coverage, source_url: review.source_url, verified_on: review.verified_on, review_due_on: review.review_due_on,
    notes: review.notes, review_notes: review.review_notes,
    prompts: [...review.college_library_prompts].sort((a,b)=>a.sort_order-b.sort_order).map(p => ({ prompt_key:p.prompt_key!, title:p.title, prompt_text:p.prompt_text, word_limit:p.word_limit, character_limit:p.character_limit, requirement:p.requirement, text_kind:p.text_kind })),
  }));
  const [dirty, setDirty] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [passage, setPassage] = useState("");
  const [targetSlot, setTargetSlot] = useState("");
  const [checked, setChecked] = useState(sourceCheck);
  const [copiedSupplement, setCopiedSupplement] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [pending, start] = useTransition();
  const editable = canEdit && review.review_state === "draft";
  const change = (patch: Partial<PromptReviewInput>) => { setContent(c => ({...c,...patch})); setDirty(true); setConfirmed(false); };
  const updatePrompt = (index: number, patch: Partial<PromptReviewInput["prompts"][number]>) => change({ prompts: content.prompts.map((p,i)=>i===index?{...p,...patch}:p) });
  return <PageShell title={`${review.college_name} · Fall ${review.entry_year}`} description={`Prompt review · Revision ${review.revision} · ${review.review_state}`}>
    <div className="space-y-5">
      <ArrowLink back href="/essays/library/review">Back to annual reviews</ArrowLink>
      <p className="text-sm text-gray-600">Check the application’s entry year, route and program. Keep conditional and optional questions separate from universal requirements. Existing assigned drafts keep their original question and limits after publication.</p>
      {review.review_state !== "draft" && <p className="rounded-lg bg-gray-50 p-3 text-sm">This publication is preserved for your review history. Start a new review from the annual review list to make changes.</p>}
      {editable && supplementSources[review.scorecard_id] && <Card><CardContent><div className="space-y-3">
        <h2 className="font-semibold">Official source review</h2>
        <ArrowLink external href={supplementSources[review.scorecard_id]}>Open the admissions page</ArrowLink>
        {retrievalEnabled ? <Button type="button" disabled={pending} onClick={()=>start(async()=>{
          try {
            const result = await fetchOfficialSupplement(review.scorecard_id,review.entry_year);
            if (result.check) { setChecked(result.check); setPassage(""); }
            else setError(result.error ?? "Unable to fetch prompts.");
          } catch { setError("Unable to fetch the official page. Try again."); }
        })}>Fetch official prompts</Button> : <p className="text-sm">Automatic retrieval requires this source to be enabled by the site administrator.</p>}
        {checked && <p role="status" className="text-sm">Checked {checked.checked_at.slice(0,10)}. {checked.issue || "Compare the official wording, limits and application routes before saving."}</p>}
        {checked?.source_text && <>
          <div className="grid gap-4 md:grid-cols-2">
            <div><h3 className="font-medium">Current review</h3>{content.prompts.map(p=><p className="mt-2 whitespace-pre-wrap text-sm" key={p.prompt_key}>{p.title} · {p.word_limit && `${p.word_limit} words`} {p.character_limit && `${p.character_limit} characters`} · {p.requirement}{"\n"}{p.prompt_text}</p>)}</div>
            <div><h3 className="font-medium">Retrieved wording</h3><textarea aria-label="Retrieved official text" readOnly rows={18} value={checked.source_text} className="mt-2 w-full rounded border p-2 text-sm" onSelect={event=>{
              const field = event.currentTarget;
              setPassage(field.value.slice(field.selectionStart,field.selectionEnd).trim());
            }}/></div>
          </div>
          {review.scorecard_id === BOSTON_COLLEGE_SCORECARD_ID ? <Button type="button" disabled={pending} onClick={()=>{
            const result = importBostonCollegeSupplement(checked.source_text,review.entry_year,content.prompts);
            if (result.content) change(result.content); else setError(result.error);
          }}>Use retrieved Boston College prompts</Button> : <div className="space-y-2">
            <p className="text-sm">Select a passage in the retrieved text, including any choice directions. Confirm the limits and applicant group below.</p>
            <Select label="Response to update" id="source-response" value={targetSlot} onChange={e=>setTargetSlot(e.target.value)} options={[{value:"",label:"Choose response"},...content.prompts.map(p=>({value:p.prompt_key,label:p.title}))]}/>
            <Button type="button" disabled={!passage || !targetSlot || pending} onClick={()=>{
              change({source_url:supplementSources[review.scorecard_id], coverage:"needs_review", verified_on:null,
                prompts:content.prompts.map(p=>p.prompt_key === targetSlot ? {...p,prompt_text:passage,text_kind:"verbatim"} : p)});
            }}>Use selected wording</Button>
          </div>}
        </>}
      </div></CardContent></Card>}
      {editable && review.scorecard_id === BOSTON_COLLEGE_SCORECARD_ID && <Card><CardContent><div className="space-y-3">
        <h2 className="font-semibold">Import Boston College’s writing supplement</h2>
        <p className="text-sm text-gray-600">Copy the Supplemental Questions heading, directions and all five numbered prompts. The import replaces the two Boston College responses, refreshes the source and application guidance, and requires a new source check.</p>
        <ArrowLink external href={BOSTON_COLLEGE_SUPPLEMENT_URL}>Open Boston College’s official supplement</ArrowLink>
        <Textarea id="copied-supplement" label="Copied supplement" rows={4} maxLength={18000} value={copiedSupplement} onChange={e=>{setCopiedSupplement(e.target.value);setImportMessage("");}} disabled={pending} />
        <Button type="button" variant="outline" disabled={pending || !copiedSupplement.trim()} onClick={()=>{
          setError("");
          const result = importBostonCollegeSupplement(copiedSupplement, review.entry_year, content.prompts);
          if (!result.content) {
            setImportMessage("");
            setError(result.error);
            return;
          }
          change(result.content);
          setCopiedSupplement("");
          setImportMessage("Two response slots imported below. Confirm the engineering limit in the application, record your source check and save the review.");
        }}>Import copied prompts</Button>
        {importMessage && <p role="status" className="text-sm text-gray-600">{importMessage}</p>}
      </div></CardContent></Card>}
      <form onSubmit={e => { e.preventDefault(); start(async()=>{
        setError(""); const result = await saveCollegePromptReview(review.id, review.updated_at, content);
        if (result.error) setError(result.error); else router.refresh();
      }); }} className="space-y-5">
        <fieldset disabled={!editable || pending} className="space-y-5">
          <Card><CardContent><div className="grid gap-4 sm:grid-cols-2">
            <Select id="coverage" label="Coverage" value={content.coverage} onChange={e=>change({coverage:e.target.value as PromptReviewInput["coverage"]})} options={PROMPT_COVERAGES.map(value=>({value,label:PROMPT_COVERAGE_LABELS[value]}))} />
            <Input id="source" label="Official source URL" required type="url" value={content.source_url} onChange={e=>change({source_url:e.target.value})} />
            <Input id="checked" label="Source checked on" type="date" value={content.verified_on ?? ""} onChange={e=>change({verified_on:e.target.value||null})} />
            <Input id="review-due" label="Next review due" type="date" value={content.review_due_on ?? ""} onChange={e=>change({review_due_on:e.target.value||null})} />
            <div className="sm:col-span-2"><Textarea id="public-notes" label="Application guidance (visible to students and families)" rows={3} maxLength={4000} value={content.notes} onChange={e=>change({notes:e.target.value})} /></div>
            <div className="sm:col-span-2"><Textarea id="review-notes" label="Review evidence and changes (staff only)" rows={3} maxLength={4000} placeholder="What did you check? Record the entry year, application section, conditions and changes." value={content.review_notes} onChange={e=>change({review_notes:e.target.value})} /></div>
          </div></CardContent></Card>
          <section aria-labelledby="review-responses" className="space-y-4"><h2 id="review-responses" className="text-lg font-semibold">Responses ({content.prompts.length})</h2>
            {content.prompts.map((p,i)=><Card key={p.prompt_key}><CardContent><div className="space-y-4">
              <h3 className="font-medium">Response {i+1}</h3>
              <Input id={`title-${i}`} label="Assignment title" required maxLength={200} value={p.title} onChange={e=>updatePrompt(i,{title:e.target.value})} />
              <Textarea id={`text-${i}`} label="Prompt or summary" required rows={4} maxLength={12000} value={p.prompt_text} onChange={e=>updatePrompt(i,{prompt_text:e.target.value})} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select id={`required-${i}`} label="Who should answer?" value={p.requirement} onChange={e=>updatePrompt(i,{requirement:e.target.value as typeof p.requirement})} options={PROMPT_REQUIREMENTS.map(value=>({value,label:value === "required" ? "Required for all applicants" : value === "conditional" ? "Conditional — specific route or program" : "Optional"}))} />
                <Select id={`kind-${i}`} label="Text type" value={p.text_kind} onChange={e=>updatePrompt(i,{text_kind:e.target.value as typeof p.text_kind})} options={PROMPT_TEXT_KINDS.map(value=>({value,label:value==="summary"?"Summary — read original at source":"Official wording"}))} />
                <Input id={`words-${i}`} label="Maximum words (if specified)" type="number" min={1} max={100000} value={p.word_limit??""} onChange={e=>updatePrompt(i,{word_limit:e.target.value?Number(e.target.value):null})} />
                <Input id={`characters-${i}`} label="Maximum characters (if specified)" type="number" min={1} max={100000} value={p.character_limit??""} onChange={e=>updatePrompt(i,{character_limit:e.target.value?Number(e.target.value):null})} />
              </div>
              <Button icon="delete" type="button" variant="ghost" onClick={()=>change({prompts:content.prompts.filter((_,index)=>index!==i)})}>Remove response {i+1} from this draft</Button>
            </div></CardContent></Card>)}
            <Button icon="add" type="button" variant="outline" onClick={()=>change({prompts:[...content.prompts,{prompt_key:`response-${crypto.randomUUID()}`,title:"",prompt_text:"",word_limit:null,character_limit:null,requirement:"conditional",text_kind:"summary"}]})}>Add response</Button>
          </section>
        </fieldset>
        {editable && <Button type="submit" loading={pending} disabled={!dirty}>Save review draft</Button>}
        {dirty && <p className="text-sm text-warning-800">Unsaved changes. Save before publishing or leaving this page.</p>}
      </form>
      {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
      {editable && <Card><CardContent><div className="space-y-4">
        <h2 className="font-semibold">Publish reviewed requirements</h2>
        <p className="text-sm text-gray-600">Publication replaces your firm’s current requirements for Fall {review.entry_year}. It affects future assignments and preserves existing student work. Record a recent source check, a future review date and review evidence first.</p>
        {canPublish ? <><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={dirty||pending} onChange={e=>setConfirmed(e.target.checked)} className="mt-1" />I checked this entry year’s official requirements and reviewed the response conditions and limits.</label>
          <Button icon="send" disabled={dirty||!confirmed} loading={pending} onClick={()=>start(async()=>{
            setError("");const result=await publishCollegePromptReview(review.id,review.updated_at);
            if(result.error)setError(result.error);else router.refresh();
          })}>Publish for my firm</Button></> : <p className="text-sm">An owner or admin can publish this saved draft.</p>}
      </div></CardContent></Card>}
    </div>
  </PageShell>;
}
