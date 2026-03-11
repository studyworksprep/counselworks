"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import { getConversationMessages } from "../db/queries";

export async function loadConversationMessages(conversationId: string) {
  return getConversationMessages(conversationId);
}

export async function createConversation(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const conversationType =
    (formData.get("conversation_type") as string) || "general";
  const studentId = (formData.get("student_id") as string) || null;
  const participantIds = formData.getAll("participant_ids") as string[];
  const initialMessage = formData.get("message") as string;

  if (!initialMessage) return { error: "Message is required" };

  const db = createServerClient();

  // Create conversation
  const { data: conv, error: convError } = await db
    .from("conversations")
    .insert({
      firm_id: ctx.firmId,
      conversation_type: conversationType,
      visibility_scope: "staff",
      student_id: studentId,
      created_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();

  if (convError || !conv) {
    console.error("Failed to create conversation:", convError);
    return { error: "Failed to create conversation" };
  }

  // Add participants (always include the creator)
  const allParticipants = new Set([ctx.dbUserId, ...participantIds]);
  const participantInserts = Array.from(allParticipants).map((userId) => ({
    conversation_id: conv.id,
    user_id: userId,
    participant_role: userId === ctx.dbUserId ? "creator" : "member",
  }));

  await db.from("conversation_participants").insert(participantInserts);

  // Send initial message
  await db.from("messages").insert({
    conversation_id: conv.id,
    sender_user_id: ctx.dbUserId,
    body: initialMessage,
  });

  // Update conversation timestamp
  await db
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conv.id);

  revalidatePath("/messages");
  return { id: conv.id };
}

export async function sendMessage(conversationId: string, body: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  if (!body.trim()) return { error: "Message cannot be empty" };

  const db = createServerClient();

  const { data, error } = await db
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_user_id: ctx.dbUserId,
      body: body.trim(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to send message:", error);
    return { error: "Failed to send message" };
  }

  // Bump conversation updated_at
  await db
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  revalidatePath("/messages");
  return { id: data.id };
}
