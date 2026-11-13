"use client";

import { useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { CollegePromptSetRow } from "@/lib/db/queries";
import { PROMPT_COVERAGE_LABELS } from "@/lib/colleges/workspace";

export function CollegePromptLibrary({ sets }: { sets: CollegePromptSetRow[] }) {
  const [search, setSearch] = useState("");
  const years = [...new Set(sets.map(s => s.entry_year))].sort((a, b) => b - a);
  const [year, setYear] = useState(String(years[0] ?? new Date().getFullYear()));
  const filtered = sets.filter(s => String(s.entry_year) === year && s.college_name.toLowerCase().includes(search.toLowerCase()));
  return <PageShell title="College prompt library" description="Shared supplemental essay requirements by entry year">
    <div className="space-y-5">
      <p className="text-sm text-gray-600">Adding a college creates student-visible drafts for its verified required prompts, using the student’s graduation year as their college entry year. Re-adding a college preserves existing work. Optional and program-specific prompts need counselor review. Colleges or years missing here are not covered.</p>
      <p className="text-sm text-gray-600">Prompt summaries link to the official wording. Check the application for your route and program before writing. Existing college lists are not backfilled automatically.</p>
      <Link href="/essays/library/review" className="inline-block text-sm font-medium text-primary-700 underline">Review and update annual prompts</Link>
      <div className="flex gap-3">
        <Input aria-label="Search library colleges" placeholder="Search colleges…" value={search} onChange={e => setSearch(e.target.value)} />
        <Select aria-label="College entry year" value={year} onChange={e => setYear(e.target.value)} options={years.map(y => ({ value: String(y), label: `Fall ${y} entry` }))} />
      </div>
      <p className="text-sm text-gray-500">{filtered.length} college records · <Link href="/essays" className="underline">Back to essays and your firm’s prompt bank</Link></p>
      {filtered.length === 0 && <Card><CardContent>No verified library coverage found for this search. Use your firm’s prompt bank to add college-specific assignments.</CardContent></Card>}
      {filtered.map(set => <Card key={set.id}><CardContent>
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{set.college_name} · Fall {set.entry_year}</h2>
          <p className="text-sm font-medium">{PROMPT_COVERAGE_LABELS[set.coverage]}</p>
          {set.firm_id && <p className="text-xs text-gray-500">Published by your firm · Revision {set.revision}</p>}
          {set.notes && <p className="text-sm text-gray-600">{set.notes}</p>}
          <p className="text-sm"><a href={set.source_url} target="_blank" rel="noreferrer" className="text-primary-600 underline">Official admissions source</a>{set.verified_on && ` · Checked ${set.verified_on}`}</p>
          {[...set.college_library_prompts].sort((a,b) => a.sort_order-b.sort_order).map(prompt => <details key={prompt.id} className="rounded-lg border border-gray-200 p-3">
            <summary className="cursor-pointer text-sm font-medium">{prompt.title} · {prompt.requirement}{prompt.word_limit ? ` · ${prompt.word_limit} words` : ""}{prompt.character_limit ? ` · ${prompt.character_limit} characters` : ""}</summary>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{prompt.prompt_text}</p>
            <p className="mt-2 text-xs text-gray-500">{prompt.text_kind === "summary" ? "Summary — see the official source for the exact prompt." : "Official prompt wording."}{prompt.requirement === "required" && set.coverage === "verified" ? " Automatically assigned when the college is added for this entry year." : " Not automatically assigned; review with the student."}</p>
          </details>)}
        </div>
      </CardContent></Card>)}
    </div>
  </PageShell>;
}
