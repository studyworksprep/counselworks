"use client";

import { PortalMessages } from "@/components/portal/portal-messages";

type PortalConversations = Parameters<
  typeof PortalMessages
>[0]["conversations"];

export function FamilyMessagesClient({
  conversations,
  initialMessage = "",
}: {
  conversations: PortalConversations;
  initialMessage?: string;
}) {
  return (
    <PortalMessages
      conversations={conversations}
      initialMessage={initialMessage}
      emptyText="No conversations yet. Message your counselor to get started."
    />
  );
}
