"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { CollegePromptReviewRow, CollegePromptSetRow } from "@/lib/db/queries";
import { promptReviewDue } from "@/lib/colleges/prompt-review";
import { startCollegePromptReview } from "@/lib/actions/college-prompts";

function StartReview({ set, canEdit }: { set: CollegePromptSetRow; canEdit: boolean }) {
  const router = useRouter();
  const [year, setYear] = useState(set.entry_year);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return <div className="space-y-2">
    <div className="flex flex-wrap items-end gap-2">
      <Input className="w-32" id={`year-${set.id}`} label="Review entry year" type="number" min={2020} max={2200} value={year} onChange={e => setYear(Number(e.target.value))} disabled={!canEdit || pending} />
      <Button variant="outline" disabled={!canEdit} loading={pending} onClick={() => start(async () => {
        setError(""); const result = await startCollegePromptReview(set.id, year);
        if (result.error) setError(result.error); else router.push(`/essays/library/review/${result.id}`);
      })}>Start review</Button>
    </div>
    {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
  </div>;
}

export function PromptReviewQueue({ sets, reviews, canEdit, today }: { sets: CollegePromptSetRow[]; reviews: CollegePromptReviewRow[]; canEdit: boolean; today: string }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [year, setYear] = useState("all");
  const years = [...new Set([...sets, ...reviews].map(s => s.entry_year))].sort((a,b) => b-a);
  const matches = (s: CollegePromptSetRow) => s.college_name.toLowerCase().includes(search.toLowerCase()) && (year === "all" || String(s.entry_year) === year);
  const drafts = reviews.filter(s => s.review_state === "draft" && matches(s));
  const history = reviews.filter(s => s.review_state !== "draft" && matches(s));
  const published = sets.filter(s => matches(s) && (filter !== "due" || promptReviewDue(s, today)));
  return <PageShell title="Annual prompt reviews" description="Review official requirements and publish updates for your firm">
    <div className="space-y-6">
      <Link href="/essays/library" className="text-sm text-primary-700 underline">Back to prompt library</Link>
      <p className="text-sm text-gray-600">Choose the college entry year before starting. Copies begin unverified, including copies for next year. Staff can prepare drafts; owners and admins publish them. Published changes apply to your firm’s new assignments. Existing student writing, limits, source records and sharing choices stay intact.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input aria-label="Search prompt reviews" placeholder="Search colleges…" value={search} onChange={e => setSearch(e.target.value)} />
        <Select aria-label="Review entry year filter" value={year} onChange={e => setYear(e.target.value)} options={[{value:"all",label:"All entry years"},...years.map(y=>({value:String(y),label:`Fall ${y}`}))]} />
        <Select aria-label="Review status filter" value={filter} onChange={e => setFilter(e.target.value)} options={[{value:"all",label:"All current requirements"},{value:"due",label:"Due or awaiting verification"}]} />
      </div>
      <section className="space-y-3" aria-labelledby="draft-reviews"><h2 id="draft-reviews" className="text-lg font-semibold">Draft reviews ({drafts.length})</h2>
        {!drafts.length && <p className="text-sm text-gray-500">No drafts for this search.</p>}
        {drafts.map(s=><Card key={s.id}><CardContent><Link href={`/essays/library/review/${s.id}`} className="font-medium text-primary-700 underline">{s.college_name} · Fall {s.entry_year} · Revision {s.revision}</Link><p className="mt-2 text-sm text-gray-500">Draft · {s.college_library_prompts.length} responses · Updated {s.updated_at.slice(0,10)}</p></CardContent></Card>)}
      </section>
      <section className="space-y-3" aria-labelledby="current-requirements"><h2 id="current-requirements" className="text-lg font-semibold">Current requirements ({published.length})</h2>
        {published.map(s=><Card key={s.id}><CardContent><div className="flex flex-wrap justify-between gap-4"><div className="space-y-2"><h3 className="font-semibold">{s.college_name} · Fall {s.entry_year}</h3><p className="text-sm">{promptReviewDue(s,today) ? "Review due or awaiting verification" : "Source check current"} · {s.firm_id ? `Your firm · Revision ${s.revision}` : "Shared library"}</p><p className="text-sm text-gray-500">Last checked: {s.verified_on ?? "Not verified"} · Next check: {s.review_due_on ?? (s.verified_on ? `${Number(s.verified_on.slice(0,4))+1}${s.verified_on.slice(4)}` : "Now")}</p><a href={s.source_url} target="_blank" rel="noreferrer" className="text-sm text-primary-700 underline">Open official source</a></div><StartReview set={s} canEdit={canEdit} /></div></CardContent></Card>)}
        {!published.length && <p className="text-sm text-gray-500">No current requirements for this filter.</p>}
      </section>
      <section className="space-y-3" aria-labelledby="review-history"><h2 id="review-history" className="text-lg font-semibold">Your firm’s publication history</h2>
        {!history.length && <p className="text-sm text-gray-500">Publication history will appear after your first release.</p>}
        {history.map(s=><p key={s.id} className="text-sm"><Link className="text-primary-700 underline" href={`/essays/library/review/${s.id}`}>{s.college_name} · Fall {s.entry_year} · Revision {s.revision}</Link> · {s.review_state} · {s.published_at?.slice(0,10)}</p>)}
      </section>
    </div>
  </PageShell>;
}
