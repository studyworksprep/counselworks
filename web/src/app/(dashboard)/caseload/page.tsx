import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { ArrowLink } from "@/components/ui/arrow-link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { getCounselorCaseload } from "@/lib/db/queries";
import { CASELOAD_FILTERS, type CaseloadFilters } from "@/lib/applications/caseload";
import { formatCalendarDate } from "@/lib/utils";
import { STAGE_LABELS } from "@/lib/constants/applications";

const input="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm";
export default async function CaseloadPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const raw=await searchParams;
  const filters:CaseloadFilters=Object.fromEntries(["search","counselor","year","college","attention","page"].map(k=>[k,typeof raw[k]==="string"?raw[k]:undefined]));
  const data=await getCounselorCaseload(filters);
  if(!data) return notFound();
  const pageHref=(page:number)=>{const params=new URLSearchParams();for(const [k,v]of Object.entries(filters))if(v&&k!=="page")params.set(k,v);params.set("page",String(page));return `/caseload?${params}`;};
  return <PageShell title="Counselor caseload" description="See who needs attention and open the work that moves each application forward.">
    <div className="space-y-6">
      <p className="text-sm text-gray-600">{data.firmWide?"Showing students you can access across the firm.":"Showing only students assigned to you."} Archived students are excluded. Priorities reflect recorded work; they do not certify that an application is complete.</p>
      <form key={JSON.stringify(filters)} action="/caseload" className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <label className="text-sm font-medium">Student name<input className={input} aria-label="Student name" name="search" defaultValue={filters.search??""} placeholder="Search students"/></label>
          <label className="text-sm font-medium">Counselor<select className={input} aria-label="Counselor" name="counselor" defaultValue={filters.counselor??""}><option value="">All accessible counselors</option>{data.counselors.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="text-sm font-medium">Graduation year<select className={input} aria-label="Graduation year" name="year" defaultValue={filters.year??""}><option value="">All years</option>{data.years.map(y=><option key={y} value={y}>{y}</option>)}</select></label>
          <label className="text-sm font-medium">College<select className={input} aria-label="College" name="college" defaultValue={filters.college??""}><option value="">All colleges</option>{data.colleges.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="text-sm font-medium">Attention needed<select className={input} aria-label="Attention needed" name="attention" defaultValue={data.attention}>{CASELOAD_FILTERS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className="mt-4 flex items-center gap-4"><Button size="sm" variant="primary" icon="filter" type="submit">Apply filters</Button><ArrowLink icon="close" href="/caseload">Reset filters</ArrowLink></div>
      </form>
      <p className="text-sm text-gray-600" role="status">{data.total} matching work {data.total===1?"group":"groups"} across {data.students} {data.students===1?"student":"students"} · Sorted by urgency, then deadline · As of {formatCalendarDate(data.today)}</p>
      {!data.rows.length&&<p className="rounded-xl border border-dashed border-gray-300 p-6">No work matches these filters. Try a broader filter or choose All work.</p>}
      <div className="space-y-4">{data.rows.map(row=><section key={row.id} aria-labelledby={`case-${row.id}`} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 [overflow-wrap:anywhere]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 id={`case-${row.id}`} className="text-lg font-semibold">{row.student} · {row.college}</h2><p className="text-sm text-gray-600">Class of {row.year} · {row.counselors.length?`Counselor: ${row.counselors.map(c=>c.name).join(", ")}`:"No counselor assigned"}</p></div>
          <LinkButton size="sm" variant="outline" icon="readiness" href={row.readinessHref}>Open student readiness</LinkButton>
        </div>
        <p className="text-sm">{row.stage?STAGE_LABELS[row.stage]??row.stage:row.collegeId?"Application not started":"General essays and linked tasks"}{row.collegeId&&<> · Deadline: {row.deadline?formatCalendarDate(row.deadline):"Not recorded"}{row.estimated?" (estimated — verify)":""}</>}</p>
        {row.issues.length?<div><h3 className="text-sm font-semibold">Next actions</h3><ul className="mt-2 space-y-2">{row.issues.map((issue,i)=><li key={`${issue.kind}-${i}`} className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm"><ArrowLink href={issue.href}>{issue.label}</ArrowLink><span className="text-gray-600">{issue.owner}</span></li>)}</ul></div>:<p className="text-sm text-gray-600">No tracked attention flags. Open readiness to review the full application.</p>}
        <ArrowLink icon="colleges" href={row.workspaceHref}>{row.collegeId?"Open college or application":"Open essays"}</ArrowLink>
      </section>)}</div>
      <nav aria-label="Caseload pages" className="flex items-center gap-4 text-sm">{data.page>1&&<ArrowLink back href={pageHref(data.page-1)}>Previous page</ArrowLink>}<span>Page {data.page} of {data.pages}</span>{data.page<data.pages&&<ArrowLink href={pageHref(data.page+1)}>Next page</ArrowLink>}</nav>
    </div>
  </PageShell>;
}
