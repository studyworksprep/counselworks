import { redirect } from "next/navigation";
import { getTaskHelpDraft } from "@/lib/db/queries";
import { PageShell } from "@/components/layout/page-shell";
import { getParentConversations } from "@/lib/db/queries";
import { FamilyMessagesClient } from "./messages-client";

export default async function FamilyMessagesPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const draft = await getTaskHelpDraft((await searchParams).task);
  const conversations = await getParentConversations();

  if (!conversations) redirect("/sign-in");

  return (
    <PageShell
      title="Messages"
      description="Conversations with your counseling team"
    >
      <FamilyMessagesClient conversations={conversations} initialMessage={draft} />
    </PageShell>
  );
}
