import { redirect } from "next/navigation";
import { getTaskHelpDraft } from "@/lib/db/queries";
import { PageShell } from "@/components/layout/page-shell";
import { getStudentConversations } from "@/lib/db/queries";
import { StudentMessagesClient } from "./messages-client";

export default async function StudentMessagesPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const draft = await getTaskHelpDraft((await searchParams).task);
  const conversations = await getStudentConversations();

  if (!conversations) redirect("/sign-in");

  return (
    <PageShell
      title="Messages"
      description="Conversations with your counseling team"
    >
      <StudentMessagesClient conversations={conversations} initialMessage={draft} />
    </PageShell>
  );
}
