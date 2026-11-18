import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { getInterviewStudents } from "@/lib/db/queries";

export default async function FamilyInterviewPage() {
 const students=await getInterviewStudents();
 return <PageShell title="Parent interview" description="Share your perspective without replacing your student's voice."><div className="space-y-4"><p className="max-w-3xl text-sm leading-6 text-gray-600">Each parent has their own responses. They begin with you and the counseling team. You choose which responses to share with your student and family. Student responses and stories appear only when shared with family.</p>{students.map(s=><Link key={s.id} href={`/family-interview/${s.id}`} className="block rounded-xl border border-gray-200 bg-white p-5 font-medium text-primary-700 hover:bg-primary-50">Interview for {s.first_name} {s.last_name}<span className="mt-1 block text-sm font-normal text-gray-500">Your observations, family priorities and counselor follow-up</span></Link>)}{!students.length&&<p className="text-sm text-gray-500">No student is linked to this account yet.</p>}</div></PageShell>;
}
