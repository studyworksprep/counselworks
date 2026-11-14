import Link from "next/link";
import { getInterviewWorkspace } from "@/lib/db/queries";
import { essayPlanningPath } from "@/lib/essays/planning";

export async function EssayStoryReferences({studentId,essayId}:{studentId:string;essayId:string}) {
 const data=await getInterviewWorkspace(studentId);if(!data)return null;
 const ids=new Set(data.links.filter(l=>l.essay_id===essayId).map(l=>l.entry_id));
 const stories=data.entries.filter(e=>ids.has(e.id));
 const path=data.kind==="student"?"/student-interview":data.kind==="parent"?`/family-interview/${studentId}`:`/students/${studentId}/interview`;
 return <section className="mb-5 rounded-xl border border-gray-200 bg-white p-4" aria-label="Stories and narratives connected to this essay">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Stories and narratives connected to this essay</h2><div className="flex flex-wrap gap-4"><Link href={`${essayPlanningPath(studentId,data.kind==="parent"?"family":data.kind==="student"?"student":"staff")}?essay=${essayId}`} className="text-sm text-primary-700 underline">Open essay planning board</Link><Link href={`${path}?view=bank`} className="text-sm text-primary-700 underline">Open story and narrative bank</Link></div></div>
  {stories.length?<ul className="mt-3 space-y-2">{stories.map(s=><li key={s.id} className="text-sm"><span>{s.title}</span><span className="ml-2 text-xs text-gray-500">{s.review_state==="confirmed"?"Student confirmed":"Needs student review"}</span></li>)}</ul>:<p className="mt-2 text-sm text-gray-500">Connect stories from the bank to track where you use an experience. Essay writing and sharing stay separate.</p>}
 </section>;
}
