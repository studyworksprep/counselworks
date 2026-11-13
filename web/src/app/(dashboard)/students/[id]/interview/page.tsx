import { notFound } from "next/navigation";
import { getInterviewWorkspace } from "@/lib/db/queries";
import { InterviewWorkspaceClient } from "@/components/interview/interview-workspace";

export default async function StudentInterviewPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{view?:string}>}) {
 const [{id},search]=await Promise.all([params,searchParams]);
 const data=await getInterviewWorkspace(id);if(!data||data.kind!=="staff")return notFound();
 return <div className="space-y-6"><div><h1 className="text-2xl font-semibold">Interview and story bank</h1><p className="mt-1 text-sm text-gray-600">Review the student’s voice, parent perspectives, and questions to explore together.</p></div><InterviewWorkspaceClient data={data} initialView={search.view==="bank"?"bank":"interview"}/></div>;
}
