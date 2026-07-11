"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm, isStaffRole } from "../auth/resolve";
import { getConversationMessages } from "../db/queries";
import { inngest } from "../queue/inngest";
import {
  AuthorizationError,
  requireConversationAccess,
  requireStaff,
  requireStudentAccess,
} from "../auth/authorize";

export async function loadConversationMessages(conversationId: string) {
  const detail = await getConversationMessages(conversationId);
  if (detail) {
    // Opening a thread marks it read (best effort — never blocks the read).
    markConversationRead(conversationId).catch(() => undefined);
  }
  return detail;
}

/**
 * Portal-account users who can be added to a conversation about a student:
 * the student themselves and their family's parents/guardians, when they
 * have real (claimed) accounts.
 */
export async function listClientParticipants(studentId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" as const };

  const db = getDb();
  try {
    requireStaff(ctx);
    await requireStudentAccess(db, ctx, studentId);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return { error: "Student not found" as const };
    }
    throw e;
  }

  const { data: student } = await db
    .from("students")
    .select(
      "id, family_id, users:user_id(id, first_name, last_name, auth_provider_user_id)"
    )
    .eq("id", studentId)
    .eq("firm_id", ctx.firmId)
    .single();
  if (!student) return { error: "Student not found" as const };

  const clients: { id: string; name: string; role: "student" | "parent" }[] =
    [];

  const studentUser = student.users as unknown as {
    id: string;
    first_name: string;
    last_name: string;
    auth_provider_user_id: string;
  } | null;
  if (
    studentUser &&
    !studentUser.auth_provider_user_id.startsWith("invited_")
  ) {
    clients.push({
      id: studentUser.id,
      name: `${studentUser.first_name} ${studentUser.last_name}`,
      role: "student",
    });
  }

  const { data: members } = await db
    .from("family_members")
    .select(
      "relationship_type, users:user_id(id, first_name, last_name, auth_provider_user_id)"
    )
    .eq("firm_id", ctx.firmId)
    .eq("family_id", student.family_id);

  for (const m of members ?? []) {
    if (!["parent", "guardian"].includes(m.relationship_type)) continue;
    const u = m.users as unknown as {
      id: string;
      first_name: string;
      last_name: string;
      auth_provider_user_id: string;
    } | null;
    if (u && !u.auth_provider_user_id.startsWith("invited_")) {
      clients.push({
        id: u.id,
        name: `${u.first_name} ${u.last_name}`,
        role: "parent",
      });
    }
  }

  return { clients };
}

/**
 * Visibility is derived from who is in the room — the explicit audience
 * decision for conversations: any parent participant makes it family-scoped,
 * a student participant makes it student-scoped, staff-only stays staff.
 */
function deriveConversationVisibility(participantRoles: string[]): string {
  if (participantRoles.includes("parent_guardian")) return "family";
  if (participantRoles.includes("student")) return "student";
  return "staff";
}

export async function createConversation(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const conversationType =
    (formData.get("conversation_type") as string) || "general";
  const studentId = (formData.get("student_id") as string) || null;
  const participantIds = (formData.getAll("participant_ids") as string[])
    .map((id) => id.trim())
    .filter(Boolean);
  const initialMessage = formData.get("message") as string;

  if (!initialMessage) return { error: "Message is required" };

  // Staff-initiated path; portals use createPortalConversation.
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const db = getDb();

  // Participants must be active members of this firm; their roles drive the
  // conversation's visibility scope.
  const participantRoles: string[] = [];
  if (participantIds.length > 0) {
    const { data: memberRows } = await db
      .from("firm_memberships")
      .select("user_id, role")
      .eq("firm_id", ctx.firmId)
      .eq("status", "active")
      .in("user_id", participantIds);
    const byId = new Map((memberRows ?? []).map((m) => [m.user_id, m.role]));
    const invalid = participantIds.filter((id) => !byId.has(id));
    if (invalid.length > 0) {
      return { error: "All participants must be members of your firm" };
    }
    participantRoles.push(
      ...participantIds.map((id) => byId.get(id) as string)
    );

    // Client participants must belong to the selected student's circle.
    if (participantRoles.some((r) => !isStaffRole(r))) {
      if (!studentId) {
        return { error: "Select the related student when messaging clients" };
      }
      const allowed = await listClientParticipants(studentId);
      if ("error" in allowed) return { error: allowed.error };
      const allowedIds = new Set(allowed.clients.map((c) => c.id));
      for (let i = 0; i < participantIds.length; i++) {
        if (
          !isStaffRole(participantRoles[i]) &&
          !allowedIds.has(participantIds[i])
        ) {
          return {
            error:
              "Clients can only be added to their own student's conversation",
          };
        }
      }
    }
  }

  const visibilityScope = deriveConversationVisibility(participantRoles);

  const { data: conv, error: convError } = await db
    .from("conversations")
    .insert({
      firm_id: ctx.firmId,
      conversation_type: conversationType,
      visibility_scope: visibilityScope,
      student_id: studentId,
      created_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();

  if (convError || !conv) {
    console.error("Failed to create conversation:", convError);
    return { error: "Failed to create conversation" };
  }

  const allParticipants = new Set([ctx.dbUserId, ...participantIds]);
  const participantInserts = Array.from(allParticipants).map((userId) => ({
    conversation_id: conv.id,
    user_id: userId,
    participant_role: userId === ctx.dbUserId ? "creator" : "member",
  }));

  await db.from("conversation_participants").insert(participantInserts);

  const { data: firstMessage } = await db
    .from("messages")
    .insert({
      conversation_id: conv.id,
      sender_user_id: ctx.dbUserId,
      body: initialMessage,
    })
    .select("id")
    .single();

  await db
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conv.id);

  if (firstMessage) {
    await emitMessageCreated(
      conv.id,
      firstMessage.id,
      ctx.dbUserId,
      ctx.firmId
    );
  }

  revalidatePath("/messages");
  return { id: conv.id };
}

/**
 * Portal-initiated conversation: a student or parent messaging their
 * counselor. Participants are the sender plus the student's primary
 * counselor (falling back to any counselor, then the firm owner).
 */
export async function createPortalConversation(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const body = ((formData.get("message") as string) || "").trim();
  if (!body) return { error: "Message is required" };

  if (ctx.role !== "student" && ctx.role !== "parent_guardian") {
    return { error: "Use the staff messages page to start conversations" };
  }

  const db = getDb();

  // Resolve the student this conversation is about.
  let studentId: string | null = null;
  if (ctx.role === "student") {
    const { data } = await db
      .from("students")
      .select("id")
      .eq("firm_id", ctx.firmId)
      .eq("user_id", ctx.dbUserId)
      .limit(1)
      .maybeSingle();
    studentId = data?.id ?? null;
    if (!studentId) return { error: "No student record linked to your account" };
  } else {
    const { data: membership } = await db
      .from("family_members")
      .select("family_id")
      .eq("firm_id", ctx.firmId)
      .eq("user_id", ctx.dbUserId)
      .limit(1)
      .maybeSingle();
    if (!membership) return { error: "No family linked to your account" };
    const { data: children } = await db
      .from("students")
      .select("id")
      .eq("firm_id", ctx.firmId)
      .eq("family_id", membership.family_id);
    // Link the student when unambiguous; multi-child families get a
    // family-level conversation and the counselor of the first child.
    if ((children ?? []).length >= 1) {
      studentId = children![0].id;
    }
  }

  // Find the counselor to include: primary counselor of the student, else
  // any counselor assignment, else a counselor/owner of the firm.
  let counselorId: string | null = null;
  if (studentId) {
    const { data: assignments } = await db
      .from("student_staff_assignments")
      .select("user_id, is_primary")
      .eq("firm_id", ctx.firmId)
      .eq("student_id", studentId)
      .eq("assignment_type", "counselor");
    const primary = (assignments ?? []).find((a) => a.is_primary);
    counselorId = primary?.user_id ?? assignments?.[0]?.user_id ?? null;
  }
  if (!counselorId) {
    const { data: fallback } = await db
      .from("firm_memberships")
      .select("user_id, role")
      .eq("firm_id", ctx.firmId)
      .eq("status", "active")
      .in("role", ["counselor", "firm_owner"])
      .order("role", { ascending: true }) // "counselor" sorts before "firm_owner"
      .limit(1)
      .maybeSingle();
    counselorId = fallback?.user_id ?? null;
  }
  if (!counselorId) return { error: "No counselor available to message" };

  // Explicit audience decision: parent-initiated threads are family-scoped,
  // student-initiated threads are student-scoped.
  const visibilityScope =
    ctx.role === "parent_guardian" ? "family" : "student";
  const conversationStudentId =
    ctx.role === "parent_guardian" ? studentId : studentId;

  const { data: conv, error: convError } = await db
    .from("conversations")
    .insert({
      firm_id: ctx.firmId,
      conversation_type: "general",
      visibility_scope: visibilityScope,
      student_id: conversationStudentId,
      created_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();
  if (convError || !conv) {
    console.error("Failed to create portal conversation:", convError);
    return { error: "Failed to start conversation" };
  }

  await db.from("conversation_participants").insert([
    {
      conversation_id: conv.id,
      user_id: ctx.dbUserId,
      participant_role: "creator",
    },
    {
      conversation_id: conv.id,
      user_id: counselorId,
      participant_role: "member",
    },
  ]);

  const { data: firstMessage } = await db
    .from("messages")
    .insert({
      conversation_id: conv.id,
      sender_user_id: ctx.dbUserId,
      body,
    })
    .select("id")
    .single();

  await db
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conv.id);

  if (firstMessage) {
    await emitMessageCreated(
      conv.id,
      firstMessage.id,
      ctx.dbUserId,
      ctx.firmId
    );
  }

  revalidatePath("/student-messages");
  revalidatePath("/family-messages");
  return { id: conv.id };
}

export async function sendMessage(conversationId: string, body: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  if (!body.trim()) return { error: "Message cannot be empty" };

  const db = getDb();

  // Tenancy + participation (staff may post in any firm conversation until
  // the participant model fully replaces the firm-wide inbox).
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

  await emitMessageCreated(conversationId, data.id, ctx.dbUserId, ctx.firmId);

  revalidatePath("/messages");
  return { id: data.id };
}

/** Mark every message in the conversation (not sent by me) as read. */
export async function markConversationRead(conversationId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const db = getDb();
  try {
    await requireConversationAccess(db, ctx, conversationId);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return { error: "Conversation not found" };
    }
    throw e;
  }

  const { data: unread } = await db
    .from("messages")
    .select("id, sender_user_id, message_reads(user_id)")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null);

  const toMark = (unread ?? [])
    .filter((m) => m.sender_user_id !== ctx.dbUserId)
    .filter(
      (m) =>
        !(
          (m as Record<string, unknown>).message_reads as Array<{
            user_id: string;
          }>
        )?.some((r) => r.user_id === ctx.dbUserId)
    )
    .map((m) => ({ message_id: m.id, user_id: ctx.dbUserId }));

  if (toMark.length > 0) {
    await db.from("message_reads").upsert(toMark, {
      onConflict: "message_id,user_id",
      ignoreDuplicates: true,
    });
  }
  return { success: true };
}

async function emitMessageCreated(
  conversationId: string,
  messageId: string,
  senderUserId: string,
  firmId: string
) {
  try {
    await inngest.send({
      name: "message/created",
      data: { conversationId, messageId, senderUserId, firmId },
    });
  } catch (e) {
    // Notification failure must never fail the send itself.
    console.error("Failed to emit message/created:", e);
  }
}
