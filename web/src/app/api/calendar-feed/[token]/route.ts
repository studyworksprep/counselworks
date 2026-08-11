import { NextResponse } from "next/server";
// Service role (RLS bypass) is required here: external calendar apps
// (Google/Apple/Outlook) subscribe with only the secret feed token — there
// is no Clerk session to scope a user client with. Authorization is the
// token itself (unguessable, rotatable, staff-only), and every query below
// is explicitly scoped to the resolved user's firm. Listed in
// docs/SECURITY.md's service-role allowlist (fix plan 10.7).
import { createServerClient } from "@/lib/db/client";
import { isStaffRole } from "@/lib/auth/resolve";
import { buildIcsCalendar } from "@/lib/calendar/ics";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  // Tokens are 48 hex chars; reject junk before touching the database.
  if (!/^[a-f0-9]{32,64}$/.test(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = createServerClient();
  const { data: user } = await db
    .from("users")
    .select("id, first_name, last_name")
    .eq("calendar_feed_token", token)
    .maybeSingle();
  if (!user) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // The feed is staff-only; resolve the counselor's firm + role.
  const { data: membership } = await db
    .from("firm_memberships")
    .select("firm_id, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership || !isStaffRole(membership.role)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Firm-wide kill switch (fix plan 11.5): when an admin disables feeds,
  // every token in the firm stops resolving immediately.
  const { data: settings } = await db
    .from("firm_settings")
    .select("calendar_feeds_enabled")
    .eq("firm_id", membership.firm_id)
    .maybeSingle();
  if (settings && settings.calendar_feeds_enabled === false) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Their meetings: attendee rows first, then the meeting range.
  const { data: attendeeRows } = await db
    .from("meeting_attendees")
    .select("meeting_id")
    .eq("user_id", user.id);
  const meetingIds = (attendeeRows ?? []).map((r) => r.meeting_id);

  const rangeStart = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const rangeEnd = new Date(Date.now() + 400 * 86_400_000).toISOString();

  let query = db
    .from("meetings")
    .select(
      `id, title, scheduled_start_at, scheduled_end_at, location_text,
       created_by_user_id, students(first_name, last_name)`
    )
    .eq("firm_id", membership.firm_id)
    .gte("scheduled_start_at", rangeStart)
    .lte("scheduled_start_at", rangeEnd)
    .order("scheduled_start_at", { ascending: true })
    .limit(500);
  if (meetingIds.length > 0) {
    query = query.or(
      `created_by_user_id.eq.${user.id},id.in.(${meetingIds.join(",")})`
    );
  } else {
    query = query.eq("created_by_user_id", user.id);
  }
  const { data: meetings } = await query;

  const ics = buildIcsCalendar({
    calendarName: `CounselWorks — ${user.first_name} ${user.last_name}`,
    events: (meetings ?? []).map((m) => {
      const student = (
        Array.isArray(m.students) ? m.students[0] : m.students
      ) as { first_name: string; last_name: string } | null;
      return {
        uid: m.id,
        title: m.title,
        start: m.scheduled_start_at,
        end: m.scheduled_end_at,
        location: m.location_text,
        description: student
          ? `Student: ${student.first_name} ${student.last_name}`
          : null,
      };
    }),
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="counselworks.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
