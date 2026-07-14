import {
  getConversations,
  getStudentsForSelect,
  getStaffForSelect,
  CONVERSATIONS_WINDOW,
} from "@/lib/db/queries";
import { MessagesClient } from "./messages-client";

export default async function MessagesPage() {
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
    />
  );
}
