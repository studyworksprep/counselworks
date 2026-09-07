"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "../db/client";
import { resolveUserAndFirm } from "../auth/resolve";
import { requireStaff } from "../auth/authorize";
import { recordAuditEvent } from "../audit";
import { getBookingSlots } from "../db/queries";
import {
  isValidTimeZone,
  parseTimeToMinutes,
} from "../booking/slots";
import {
  BOOKING_SLOT_MINUTES,
  BOOKING_SOURCES,
  PORTAL_BOOKING_MEETING_TYPE,
} from "../constants/meetings";
import { resolveNotificationPrefs } from "../notifications/prefs";
import {
  sendMeetingBookedFamilyEmail,
  sendMeetingBookedStaffEmail,
} from "../email";

const appUrl = () =>
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://www.counselworks.io";

// ---------------------------------------------------------------------------
// Staff: publish availability (Settings → Booking availability)
// ---------------------------------------------------------------------------
const settingsSchema = z.object({
  enabled: z.boolean(),
  timezone: z.string().refine(isValidTimeZone, "Choose a valid timezone"),
  slot_minutes: z.number().refine(
    (n) => (BOOKING_SLOT_MINUTES as readonly number[]).includes(n),
    "Choose a slot length"
  ),
  min_notice_hours: z.number().int().min(0).max(336),
  max_days_ahead: z.number().int().min(1).max(120),
  location_text: z.string().max(500).nullable(),
  windows: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        start_minute: z.number().int().min(0).max(1439),
        end_minute: z.number().int().min(1).max(1440),
      })
    )
    .refine(
      (ws) => ws.every((w) => w.end_minute > w.start_minute),
      "Each window must end after it starts"
    ),
});

/**
 * Replace the caller's booking rules and weekly windows. One window per
 * weekday from the form (`weekday_N_enabled/start/end`); the table allows
 * more, but this form is its only writer.
 */
export async function updateBookingSettings(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  try {
    requireStaff(ctx);
  } catch {
    return { error: "Not authorized" };
  }

  const windows: { weekday: number; start_minute: number; end_minute: number }[] = [];
  for (let d = 0; d < 7; d++) {
    if (formData.get(`weekday_${d}_enabled`) !== "on") continue;
    const start = parseTimeToMinutes(String(formData.get(`weekday_${d}_start`) ?? ""));
    const end = parseTimeToMinutes(String(formData.get(`weekday_${d}_end`) ?? ""));
    if (start === null || end === null) {
      return { error: "Enter a start and end time for every available day" };
    }
    windows.push({ weekday: d, start_minute: start, end_minute: end });
  }

  const parsed = settingsSchema.safeParse({
    enabled: formData.get("enabled") === "on",
    timezone: String(formData.get("timezone") ?? ""),
    slot_minutes: Number(formData.get("slot_minutes")),
    min_notice_hours: Number(formData.get("min_notice_hours")),
    max_days_ahead: Number(formData.get("max_days_ahead")),
    location_text: (String(formData.get("location_text") ?? "").trim() || null),
    windows,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid availability" };
  }
  const input = parsed.data;
  if (input.enabled && input.windows.length === 0) {
    return { error: "Add at least one available day, or turn booking off" };
  }

  const db = getDb();
  const { error: settingsError } = await db
    .from("staff_booking_settings")
    .upsert(
      {
        firm_id: ctx.firmId,
        user_id: ctx.dbUserId,
        enabled: input.enabled,
        timezone: input.timezone,
        slot_minutes: input.slot_minutes,
        min_notice_hours: input.min_notice_hours,
        max_days_ahead: input.max_days_ahead,
        location_text: input.location_text,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "firm_id,user_id" }
    );
  if (settingsError) {
    console.error("Failed to save booking settings:", settingsError);
    return { error: "Failed to save availability" };
  }

  // Replace-all windows for this user (delete then insert; both scoped).
  const { error: deleteError } = await db
    .from("staff_availability_windows")
    .delete()
    .eq("firm_id", ctx.firmId)
    .eq("user_id", ctx.dbUserId);
  if (deleteError) {
    console.error("Failed to clear availability windows:", deleteError);
    return { error: "Failed to save availability" };
  }
  if (input.windows.length > 0) {
    const { error: insertError } = await db.from("staff_availability_windows").insert(
      input.windows.map((w) => ({
        firm_id: ctx.firmId,
        user_id: ctx.dbUserId,
        weekday: w.weekday,
        start_minute: w.start_minute,
        end_minute: w.end_minute,
      }))
    );
    if (insertError) {
      console.error("Failed to save availability windows:", insertError);
      return { error: "Failed to save availability" };
    }
  }

  revalidatePath("/settings");
  revalidatePath("/family-booking");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Parent: book a slot
// ---------------------------------------------------------------------------
const bookSchema = z.object({
  student_id: z.string().uuid(),
  staff_user_id: z.string().uuid(),
  start: z.string().datetime(),
  include_student: z.boolean(),
  note: z.string().max(1000).nullable(),
});

/**
 * Book one of the counselor's open slots for the household. Runs as the
 * parent (user-scoped client; the 00040 RLS policy admits exactly this
 * shape). The slot is recomputed server-side and must match exactly, so a
 * stale page or a race with another booking fails loudly instead of
 * double-booking.
 */
export async function bookMeeting(formData: FormData) {
  const ctx = await resolveUserAndFirm();
  if (!ctx) return { error: "Not authenticated" };
  if (ctx.role !== "parent_guardian") return { error: "Only families can book from the portal" };

  const parsed = bookSchema.safeParse({
    student_id: String(formData.get("student_id") ?? ""),
    staff_user_id: String(formData.get("staff_user_id") ?? ""),
    start: String(formData.get("start") ?? ""),
    include_student: formData.get("include_student") === "on",
    note: String(formData.get("note") ?? "").trim() || null,
  });
  if (!parsed.success) return { error: "Choose a time slot" };
  const input = parsed.data;

  const availability = await getBookingSlots({
    staffUserId: input.staff_user_id,
    studentId: input.student_id,
  });
  if (!availability) return { error: "This counselor is not available for booking" };
  const slot = availability.slots.find(
    (s) => Date.parse(s.start) === Date.parse(input.start)
  );
  if (!slot) {
    return { error: "That time is no longer available — please pick another slot" };
  }

  const db = getDb();
  const { data: parentRow } = await db
    .from("users")
    .select("first_name, last_name, email")
    .eq("id", ctx.dbUserId)
    .maybeSingle();
  const parentName = parentRow
    ? `${parentRow.first_name} ${parentRow.last_name}`
    : "A family member";
  const studentName = `${availability.student.first_name} ${availability.student.last_name}`;

  // Include the student only when they hold an active portal membership —
  // attendee rows are for people who can actually see the meeting.
  let studentUserId: string | null = null;
  if (input.include_student && availability.student.user_id) {
    const { data: membership } = await db
      .from("firm_memberships")
      .select("user_id")
      .eq("firm_id", ctx.firmId)
      .eq("user_id", availability.student.user_id)
      .eq("status", "active")
      .maybeSingle();
    studentUserId = membership?.user_id ?? null;
  }

  const { data: family } = await db
    .from("family_members")
    .select("family_id")
    .eq("firm_id", ctx.firmId)
    .eq("user_id", ctx.dbUserId)
    .limit(1)
    .maybeSingle();
  if (!family) return { error: "Your account is not linked to a household" };

  const { data: meeting, error } = await db
    .from("meetings")
    .insert({
      firm_id: ctx.firmId,
      family_id: family.family_id,
      student_id: input.student_id,
      title: `Meeting with ${availability.counselorName}`,
      meeting_type: PORTAL_BOOKING_MEETING_TYPE,
      scheduled_start_at: slot.start,
      scheduled_end_at: slot.end,
      location_text: availability.rules.location_text,
      agenda: input.note,
      // A parent attendee ⇒ family-visible (deriveMeetingVisibility); the RLS
      // policy requires the same, so the audience is explicit twice.
      visibility_scope: "family",
      booking_source: BOOKING_SOURCES.portal,
      created_by_user_id: ctx.dbUserId,
      updated_by_user_id: ctx.dbUserId,
    })
    .select("id")
    .single();
  if (error || !meeting) {
    console.error("Failed to book meeting:", error);
    return { error: "Failed to book the meeting" };
  }

  const attendees = [
    { meeting_id: meeting.id, user_id: input.staff_user_id, attendance_status: "accepted" },
    { meeting_id: meeting.id, user_id: ctx.dbUserId, attendance_status: "accepted" },
    ...(studentUserId
      ? [{ meeting_id: meeting.id, user_id: studentUserId, attendance_status: "pending" }]
      : []),
  ];
  const { error: attendeeError } = await db.from("meeting_attendees").insert(attendees);
  if (attendeeError) {
    console.error("Failed to add booking attendees:", attendeeError);
  }

  await recordAuditEvent(db, {
    firmId: ctx.firmId,
    actorUserId: ctx.dbUserId,
    entityType: "meeting",
    entityId: meeting.id,
    actionType: "meeting_self_booked",
    label: `${parentName} booked a meeting with ${availability.counselorName} (${studentName})`,
  });

  // Tell the counselor: in-app always, email per their meeting preference.
  const startsAt = new Date(slot.start).toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: availability.rules.timezone,
    timeZoneName: "short",
  });
  await db.from("notifications").insert({
    firm_id: ctx.firmId,
    user_id: input.staff_user_id,
    kind: "meeting_booked",
    title: `${parentName} booked a meeting (${studentName})`,
    body: startsAt,
    href: "/calendar",
  });
  const { data: counselor } = await db
    .from("users")
    .select("first_name, email, notification_preferences_json")
    .eq("id", input.staff_user_id)
    .maybeSingle();
  const { data: firm } = await db.from("firms").select("name").eq("id", ctx.firmId).maybeSingle();
  try {
    if (
      counselor?.email &&
      resolveNotificationPrefs(counselor.notification_preferences_json).meeting_reminders
    ) {
      await sendMeetingBookedStaffEmail({
        email: counselor.email,
        firstName: counselor.first_name,
        bookedByName: parentName,
        studentName,
        startsAt,
        location: availability.rules.location_text,
        note: input.note,
        meetingUrl: `${appUrl()}/calendar`,
      });
    }
    if (parentRow?.email) {
      await sendMeetingBookedFamilyEmail({
        email: parentRow.email,
        firstName: parentRow.first_name,
        counselorName: availability.counselorName,
        studentName,
        startsAt: new Date(slot.start).toLocaleString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: availability.rules.timezone,
          timeZoneName: "short",
        }),
        location: availability.rules.location_text,
        firmName: firm?.name ?? "your counseling firm",
        portalUrl: `${appUrl()}/family-dashboard`,
      });
    }
  } catch (e) {
    // The booking stands; email is a courtesy.
    console.error("Booking emails failed (non-fatal):", e);
  }

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  revalidatePath("/family-dashboard");
  revalidatePath("/family-booking");
  revalidatePath("/student-dashboard");
  revalidatePath(`/students/${input.student_id}/meetings`);
  revalidatePath(`/families/${family.family_id}/meetings`);
  return { id: meeting.id, start: slot.start, end: slot.end };
}
