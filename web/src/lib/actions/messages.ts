"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import {
  AuthorizationError,
  requireConversationAccess,
  requireStaff,
} from "../auth/authorize";
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

  // Staff-only until Phase 3 adds portal-initiated conversations.
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const db = getDb();

  // Only firm members can be added as participants.
  if (participantIds.length > 0) {
    const { data: memberRows } = await db
      .from("firm_memberships")
      .select("user_id")
      .eq("firm_id", ctx.firmId)
      .eq("status", "active")
      .in("user_id", participantIds);
    const memberIds = new Set((memberRows ?? []).map((m) => m.user_id));
    const invalid = participantIds.filter((id) => !memberIds.has(id));
    if (invalid.length > 0) {
      return { error: "All participants must be members of your firm" };
    }
  }

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

  const db = getDb();

  // Tenancy + participation (staff may post in any firm conversation until
  // Phase 3 tightens the model).
  try {
    await requireConversationAccess(db, ctx, conversationId);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return { error: "Conversation not found" };
    }
    throw e;
  }

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
