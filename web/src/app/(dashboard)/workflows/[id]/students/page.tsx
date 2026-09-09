import Link from "next/link";
import {getActivePlanStudents} from "@/lib/db/queries";
import {PageShell} from "@/components/layout/page-shell";
export default async function ActivePlanStudents({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;const plans=await getActivePlanStudents(id);
  return <PageShell title="Students running this plan">
    <Link className="underline" href={`/workflows/${id}`}>Back to template</Link>
    <ul className="mt-4 space-y-3">{plans.map(p=><li key={p.id} className="rounded border p-3"><Link className="font-medium underline" href={`/students/${p.studentId}`}>{p.name}</Link><p className="text-sm">{p.plan} · {p.status.replaceAll('_',' ')}</p></li>)}</ul>
    {!plans.length && <p className="mt-4">No active plans in your caseload.</p>}
  </PageShell>;
}
