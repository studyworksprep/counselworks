"use client";

import { PortalMessages } from "@/components/portal/portal-messages";

type PortalConversations = Parameters<
  typeof PortalMessages
>[0]["conversations"];

export function FamilyMessagesClient({
  conversations,
}: {
  conversations: PortalConversations;
}) {
  return (
    <PortalMessages
      conversations={conversations}
      emptyText="No conversations yet. Message your counselor to get started."
    />
  );
}
