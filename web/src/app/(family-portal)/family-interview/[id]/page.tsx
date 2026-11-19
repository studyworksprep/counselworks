import { ArrowLink } from "@/components/ui/arrow-link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { getInterviewWorkspace } from "@/lib/db/queries";
import { InterviewWorkspaceClient } from "@/components/interview/interview-workspace";

export default async function ParentInterviewPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{view?:string}>}) {
 const [{id},search]=await Promise.all([params,searchParams]);
 const data=await getInterviewWorkspace(id);if(!data||data.kind!=="parent")return notFound();
 return <PageShell title={`Parent interview · ${data.student.name}`} description="Your observations and priorities, kept separate from your student's responses."><ArrowLink back className="mb-5" href="/family-interview">Choose another student</ArrowLink><InterviewWorkspaceClient data={data} initialView={search.view==="strategy"?"strategy":search.view==="bank"?"bank":"interview"}/></PageShell>;
}
