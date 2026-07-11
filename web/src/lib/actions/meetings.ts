"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import { requireStaff } from "../auth/authorize";

function parseSchedule(formData: FormData): {
  scheduledStart: string | null;
  scheduledEnd: string | null;
} {
  const startDate = formData.get("start_date") as string;
  const startTime = formData.get("start_time") as string;
  const endTime = formData.get("end_time") as string;

  let scheduledStart: string | null = null;
  let scheduledEnd: string | null = null;
  if (startDate && startTime) {
    scheduledStart = new Date(`${startDate}T${startTime}`).toISOString();
    if (endTime) {
      scheduledEnd = new Date(`${startDate}T${endTime}`).toISOString();
    }
  }
  return { scheduledStart, scheduledEnd };
}

/**
 * Validate attendee ids against firm membership and return their roles.
 * Returns null (with no roles) when any id is not an active firm member.
 */
async function resolveAttendeeRoles(
  db: ReturnType<typeof getDb>,
  firmId: string,
  attendeeIds: string[]
): Promise<Map<string, string> | null> {
  if (attendeeIds.length === 0) return new Map();
  const { data: rows } = await db
    .from("firm_memberships")
    .select("user_id, role")
    .eq("firm_id", firmId)
    .eq("status", "active")
    .in("user_id", attendeeIds);
  const byId = new Map((rows ?? []).map((m) => [m.user_id, m.role]));
  if (attendeeIds.some((id) => !byId.has(id))) return null;
  return byId;
}

/**
 * Explicit audience decision: meetings with a parent attendee are
 * family-visible, with a student attendee student-visible, staff-only
 * otherwise.
 */
function deriveMeetingVisibility(attendeeRoles: Iterable<string>): string {
  const roles = Array.from(attendeeRoles);
  if (roles.includes("parent_guardian")) return "family";
  if (roles.includes("student")) return "student";
  return "staff";
}

export async function createMeeting(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const title = formData.get("title") as string;
  if (!title) return { error: "Title is required" };

  const { scheduledStart, scheduledEnd } = parseSchedule(formData);

  const db = getDb();

  const attendeeIds = (formData.getAll("attendee_ids") as string[])
    .map((id) => id.trim())
    .filter(Boolean)
    .filter((id) => id !== ctx.dbUserId);
  const roleById = await resolveAttendeeRoles(db, ctx.firmId, attendeeIds);
  if (!roleById) {
    return { error: "All attendees must be members of your firm" };
  }

  const { data, error } = await db
    .from("meetings")
    .insert({
      firm_id: ctx.firmId,
      title,
      meeting_type: (formData.get("meeting_type") as string) || "general",
      scheduled_start_at: scheduledStart,
      scheduled_end_at: scheduledEnd,
      location_text: (formData.get("location_text") as string) || null,
      agenda: (formData.get("agenda") as string) || null,
      student_id: (formData.get("student_id") as string) || null,
      visibility_scope: deriveMeetingVisibility(roleById.values()),
      created_by_user_id: ctx.dbUserId,
      updated_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create meeting:", error);
    return { error: "Failed to create meeting" };
  }

  // Creator attends; invited attendees start pending. (RSVP flow is a
  // later phase — status is informational for now.)
  await db.from("meeting_attendees").insert([
    {
      meeting_id: data.id,
      user_id: ctx.dbUserId,
      attendance_status: "accepted",
    },
    ...attendeeIds.map((userId) => ({
      meeting_id: data.id,
      user_id: userId,
      attendance_status: "pending",
    })),
  ]);

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return { id: data.id };
}

export async function updateMeeting(meetingId: string, formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const title = formData.get("title") as string;
  if (!title) return { error: "Title is required" };

  const { scheduledStart, scheduledEnd } = parseSchedule(formData);

  const db = getDb();

  const { data: existing } = await db
    .from("meetings")
    .select("id, created_by_user_id")
    .eq("id", meetingId)
    .eq("firm_id", ctx.firmId)
    .maybeSingle();
  if (!existing) return { error: "Meeting not found" };

  const attendeeIds = (formData.getAll("attendee_ids") as string[])
    .map((id) => id.trim())
    .filter(Boolean)
    .filter((id) => id !== existing.created_by_user_id);
  const roleById = await resolveAttendeeRoles(db, ctx.firmId, attendeeIds);
  if (!roleById) {
    return { error: "All attendees must be members of your firm" };
  }

  const { error } = await db
    .from("meetings")
    .update({
      title,
      meeting_type: (formData.get("meeting_type") as string) || "general",
      scheduled_start_at: scheduledStart,
      scheduled_end_at: scheduledEnd,
      location_text: (formData.get("location_text") as string) || null,
      agenda: (formData.get("agenda") as string) || null,
      summary: (formData.get("summary") as string) || null,
      student_id: (formData.get("student_id") as string) || null,
      visibility_scope: deriveMeetingVisibility(roleById.values()),
      updated_by_user_id: ctx.dbUserId,
    })
    .eq("id", meetingId)
    .eq("firm_id", ctx.firmId);

  if (error) {
    console.error("Failed to update meeting:", error);
    return { error: "Failed to update meeting" };
  }

  // Replace the attendee list (creator keeps their accepted row).
  await db
    .from("meeting_attendees")
    .delete()
    .eq("meeting_id", meetingId)
    .neq("user_id", existing.created_by_user_id);
  if (attendeeIds.length > 0) {
    await db.from("meeting_attendees").insert(
      attendeeIds.map((userId) => ({
        meeting_id: meetingId,
        user_id: userId,
        attendance_status: "pending",
      }))
    );
  }

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteMeeting(meetingId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const db = getDb();
  const { error } = await db
    .from("meetings")
    .delete()
    .eq("id", meetingId)
    .eq("firm_id", ctx.firmId);

  if (error) return { error: "Failed to delete meeting" };

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return { success: true };
}
