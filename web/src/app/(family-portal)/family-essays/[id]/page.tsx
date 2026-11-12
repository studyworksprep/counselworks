import Link from "next/link";
import { notFound } from "next/navigation";
import { getParentEssayById } from "@/lib/db/queries";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ESSAY_STATUS_BADGES, ESSAY_STATUS_PORTAL_LABELS } from "@/lib/constants/essays";
import { EssayPromptSource } from "@/components/essays/prompt-source";

export default async function FamilyEssayPage({ params }: { params: Promise<{ id: string }> }) {
  const essay = await getParentEssayById((await params).id);
  if (!essay) notFound();
  return <PageShell title={essay.title || "Shared essay"} description="Shared with your family · Read only"
    actions={<Link prefetch={false} className="text-sm text-primary-700 underline" href={essay.student_college_id ? `/family-colleges/${essay.student_college_id}` : "/family-colleges"}>Back to college workspace</Link>}>
    <div className="space-y-5">
      <EssayPromptSource snapshot={essay.library_prompt_snapshot} />
      <Badge variant={ESSAY_STATUS_BADGES[essay.status] ?? "default"}>{ESSAY_STATUS_PORTAL_LABELS[essay.status] ?? essay.status}</Badge>
      {essay.prompt_text && <Card><CardContent><h2 className="mb-3 font-semibold">Prompt</h2><p className="whitespace-pre-wrap text-sm">{essay.prompt_text}</p></CardContent></Card>}
      <Card><CardContent><h2 className="mb-3 font-semibold">Shared draft</h2><p className="whitespace-pre-wrap text-sm">{essay.body || "The shared draft is empty."}</p></CardContent></Card>
    </div>
  </PageShell>;
}
