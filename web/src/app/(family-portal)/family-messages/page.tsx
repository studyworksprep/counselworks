import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { getParentConversations } from "@/lib/db/queries";
import { FamilyMessagesClient } from "./messages-client";

export default async function FamilyMessagesPage() {
  const conversations = await getParentConversations();

  if (!conversations) redirect("/sign-in");

  return (
    <PageShell
      title="Messages"
      description="Conversations with your counseling team"
    >
      <FamilyMessagesClient conversations={conversations} />
    </PageShell>
  );
}
