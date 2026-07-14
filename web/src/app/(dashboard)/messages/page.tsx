import {
  getConversations,
  getStudentsForSelect,
  getStaffForSelect,
  CONVERSATIONS_WINDOW,
} from "@/lib/db/queries";
import { MessagesClient } from "./messages-client";

interface Props {
  searchParams: Promise<{ c?: string }>;
}

export default async function MessagesPage({ searchParams }: Props) {
  const { c } = await searchParams;
  const [conversations, students, staff] = await Promise.all([
    getConversations(),
    getStudentsForSelect(),
    getStaffForSelect(),
  ]);

  return (
    <MessagesClient
      conversations={conversations}
      students={students}
      staff={staff}
      capped={conversations.length >= CONVERSATIONS_WINDOW}
      initialConversationId={c ?? null}
    />
  );
}
