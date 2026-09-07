"use client";

import { useState } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
import {
  CreateMeetingModal,
  MeetingDetailModal,
  type ClientsByStudent,
  type Meeting,
} from "@/app/(dashboard)/calendar/calendar-client";

/**
 * Upcoming/past meeting list for the student and family workspaces (fix
 * plan 13.0). Reuses the calendar's schedule and detail/edit modals so
 * behaviour (timezone handling, attendees, portal visibility,
 * useWriteRefresh repaint) is identical. Captured-object rule: the open
 * meeting is held by id and derived from current props, so a repaint
 * after an edit shows the new values.
 */
export function MeetingsListClient({
  students,
  defaultStudentId,
  nowIso,
  meetings,
  staff,
  clientsByStudent,
}: {
  /** Students the schedule modal may pick from (one for a student page). */
  students: { id: string; name: string }[];
  defaultStudentId?: string;
  /** Request-time boundary between upcoming and past (render must stay pure). */
  nowIso: string;
  meetings: Meeting[];
  staff: { id: string; name: string }[];
  clientsByStudent: ClientsByStudent;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const openMeeting = meetings.find((m) => m.id === openId) ?? null;
  const showStudent = students.length > 1;

  const now = new Date(nowIso).getTime();
  const upcoming = meetings
    .filter((m) => m.scheduled_start_at && new Date(m.scheduled_start_at).getTime() >= now)
    .sort((a, b) => a.scheduled_start_at!.localeCompare(b.scheduled_start_at!));
  const past = meetings
    .filter((m) => !m.scheduled_start_at || new Date(m.scheduled_start_at).getTime() < now)
    .sort((a, b) => (b.scheduled_start_at ?? "").localeCompare(a.scheduled_start_at ?? ""));

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setShowCreate(true)}>Schedule Meeting</Button>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Upcoming</h3>
          </CardHeader>
          <CardContent>
            <MeetingList
              items={upcoming}
              empty="No upcoming meetings scheduled."
              showStudent={showStudent}
              onOpen={setOpenId}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Past</h3>
          </CardHeader>
          <CardContent>
            <MeetingList
              items={past}
              empty="No past meetings yet."
              showStudent={showStudent}
              onOpen={setOpenId}
            />
          </CardContent>
        </Card>
      </div>

      <CreateMeetingModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        students={students}
        staff={staff}
        clientsByStudent={clientsByStudent}
        defaultStudentId={defaultStudentId}
      />
      <MeetingDetailModal
        meeting={openMeeting}
        onClose={() => setOpenId(null)}
        students={students}
        staff={staff}
        clientsByStudent={clientsByStudent}
      />
    </div>
  );
}

function MeetingList({
  items,
  empty,
  showStudent,
  onOpen,
}: {
  items: Meeting[];
  empty: string;
  showStudent: boolean;
  onOpen: (id: string) => void;
}) {
  if (items.length === 0) return <p className="text-sm text-gray-500">{empty}</p>;
  return (
    <ul className="divide-y divide-gray-100">
      {items.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            onClick={() => onOpen(m.id)}
            className="flex w-full flex-wrap items-center gap-2 py-2 text-left hover:bg-gray-50"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900">{m.title}</p>
              <p className="text-xs text-gray-500">
                {m.scheduled_start_at ? formatDateTime(m.scheduled_start_at) : "Unscheduled"}
                {showStudent && m.student_name && ` · ${m.student_name}`}
                {m.location_text && ` · ${m.location_text}`}
                {m.attendees.length > 0 &&
                  ` · ${m.attendees.length} attendee${m.attendees.length === 1 ? "" : "s"}`}
              </p>
            </div>
            <Badge variant="default">{m.meeting_type.replace(/_/g, " ")}</Badge>
            {m.booking_source === "portal" && <Badge variant="primary">Booked by family</Badge>}
            {m.summary && <Badge variant="success">Summary</Badge>}
          </button>
        </li>
      ))}
    </ul>
  );
}
