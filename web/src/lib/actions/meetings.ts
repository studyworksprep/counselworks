"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";

export async function createMeeting(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const title = formData.get("title") as string;
  if (!title) return { error: "Title is required" };

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

  const db = getDb();
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
      visibility_scope: "staff",
      created_by_user_id: ctx.dbUserId,
      updated_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to create meeting:", error);
    return { error: "Failed to create meeting" };
  }

  // Add creator as attendee
  await db.from("meeting_attendees").insert({
    meeting_id: data.id,
    user_id: ctx.dbUserId,
    attendance_status: "accepted",
  });

  // Add additional attendees
  const attendeeIds = formData.getAll("attendee_ids") as string[];
  if (attendeeIds.length > 0) {
    await db.from("meeting_attendees").insert(
      attendeeIds
        .filter((id) => id !== ctx.dbUserId)
        .map((userId) => ({
          meeting_id: data.id,
          user_id: userId,
          attendance_status: "pending",
        }))
    );
  }

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return { id: data.id };
}

export async function updateMeeting(meetingId: string, formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

  const title = formData.get("title") as string;
  if (!title) return { error: "Title is required" };

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

  const db = getDb();
  const { error } = await db
    .from("meetings")
    .update({
      title,
      meeting_type: (formData.get("meeting_type") as string) || "general",
      scheduled_start_at: scheduledStart,
      scheduled_end_at: scheduledEnd,
      location_text: (formData.get("location_text") as string) || null,
      agenda: (formData.get("agenda") as string) || null,
      student_id: (formData.get("student_id") as string) || null,
      updated_by_user_id: ctx.dbUserId,
    })
    .eq("id", meetingId)
    .eq("firm_id", ctx.firmId);

  if (error) {
    console.error("Failed to update meeting:", error);
    return { error: "Failed to update meeting" };
  }

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteMeeting(meetingId: string) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };

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
