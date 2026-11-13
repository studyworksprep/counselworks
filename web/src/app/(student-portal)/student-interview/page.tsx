import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { getInterviewStudents, getInterviewWorkspace } from "@/lib/db/queries";
import { InterviewWorkspaceClient } from "@/components/interview/interview-workspace";

export default async function MyInterviewPage({searchParams}:{searchParams:Promise<{view?:string}>}) {
 const [students,search]=await Promise.all([getInterviewStudents(),searchParams]);
 const data=students[0]?await getInterviewWorkspace(students[0].id):null;
 if(!data||data.kind!=="student")return notFound();
 return <PageShell title="My interview and stories" description="Your priorities, your experiences, and what you want people to understand."><InterviewWorkspaceClient data={data} initialView={search.view==="bank"?"bank":"interview"}/></PageShell>;
}
