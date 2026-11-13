"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
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
import { publishCollegePromptReview, saveCollegePromptReview } from "@/lib/actions/college-prompts";

export function PromptReviewEditor({ review, canEdit, canPublish }: { review: CollegePromptReviewRow; canEdit: boolean; canPublish: boolean }) {
  const router = useRouter();
  const [content, setContent] = useState<PromptReviewInput>(() => ({
    coverage: review.coverage, source_url: review.source_url, verified_on: review.verified_on, review_due_on: review.review_due_on,
    notes: review.notes, review_notes: review.review_notes,
    prompts: [...review.college_library_prompts].sort((a,b)=>a.sort_order-b.sort_order).map(p => ({ prompt_key:p.prompt_key!, title:p.title, prompt_text:p.prompt_text, word_limit:p.word_limit, character_limit:p.character_limit, requirement:p.requirement, text_kind:p.text_kind })),
  }));
  const [dirty, setDirty] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const editable = canEdit && review.review_state === "draft";
  const change = (patch: Partial<PromptReviewInput>) => { setContent(c => ({...c,...patch})); setDirty(true); setConfirmed(false); };
  const updatePrompt = (index: number, patch: Partial<PromptReviewInput["prompts"][number]>) => change({ prompts: content.prompts.map((p,i)=>i===index?{...p,...patch}:p) });
  return <PageShell title={`${review.college_name} · Fall ${review.entry_year}`} description={`Prompt review · Revision ${review.revision} · ${review.review_state}`}>
    <div className="space-y-5">
      <Link href="/essays/library/review" className="text-sm text-primary-700 underline">Back to annual reviews</Link>
      <p className="text-sm text-gray-600">Check the application’s entry year, route and program. Keep conditional and optional questions separate from universal requirements. Existing assigned drafts keep their original question and limits after publication.</p>
      {review.review_state !== "draft" && <p className="rounded-lg bg-gray-50 p-3 text-sm">This publication is preserved for your review history. Start a new review from the annual review list to make changes.</p>}
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
              <Button type="button" variant="ghost" onClick={()=>change({prompts:content.prompts.filter((_,index)=>index!==i)})}>Remove response {i+1} from this draft</Button>
            </div></CardContent></Card>)}
            <Button type="button" variant="outline" onClick={()=>change({prompts:[...content.prompts,{prompt_key:`response-${crypto.randomUUID()}`,title:"",prompt_text:"",word_limit:null,character_limit:null,requirement:"conditional",text_kind:"summary"}]})}>Add response</Button>
          </section>
        </fieldset>
        {editable && <Button type="submit" loading={pending} disabled={!dirty}>Save review draft</Button>}
        {dirty && <p className="text-sm text-amber-800">Unsaved changes. Save before publishing or leaving this page.</p>}
      </form>
      {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
      {editable && <Card><CardContent><div className="space-y-4">
        <h2 className="font-semibold">Publish reviewed requirements</h2>
        <p className="text-sm text-gray-600">Publication replaces your firm’s current requirements for Fall {review.entry_year}. It affects future assignments and preserves existing student work. Record a recent source check, a future review date and review evidence first.</p>
        {canPublish ? <><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={dirty||pending} onChange={e=>setConfirmed(e.target.checked)} className="mt-1" />I checked this entry year’s official requirements and reviewed the response conditions and limits.</label>
          <Button disabled={dirty||!confirmed} loading={pending} onClick={()=>start(async()=>{
            setError("");const result=await publishCollegePromptReview(review.id,review.updated_at);
            if(result.error)setError(result.error);else router.refresh();
          })}>Publish for my firm</Button></> : <p className="text-sm">An owner or admin can publish this saved draft.</p>}
      </div></CardContent></Card>}
    </div>
  </PageShell>;
}
