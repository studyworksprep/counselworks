"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
} from "date-fns";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/modals/modal";
import { createMeeting, deleteMeeting } from "@/lib/actions/meetings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Meeting {
  id: string;
  title: string;
  meeting_type: string;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  location_text: string | null;
  agenda: string | null;
  summary: string | null;
  visibility_scope: string;
  student_name: string | null;
  attendees: { name: string; status: string | null }[];
}

interface UpcomingMeeting {
  id: string;
  title: string;
  meeting_type: string;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  location_text: string | null;
  student_name: string | null;
}

interface Deadline {
  id: string;
  stage: string;
  deadline_at: string | null;
  student_name: string | null;
  college_name: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const meetingTypeColor: Record<string, string> = {
  general: "bg-blue-100 text-blue-700",
  initial_consultation: "bg-green-100 text-green-700",
  strategy_session: "bg-purple-100 text-purple-700",
  essay_review: "bg-orange-100 text-orange-700",
  parent_meeting: "bg-yellow-100 text-yellow-700",
  check_in: "bg-gray-100 text-gray-700",
};

// ---------------------------------------------------------------------------
// Create Meeting Modal
// ---------------------------------------------------------------------------
function CreateMeetingModal({
  open,
  onClose,
  students,
  staff,
}: {
  open: boolean;
  onClose: () => void;
  students: { id: string; name: string }[];
  staff: { id: string; name: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createMeeting(formData);
      if (result.error) {
        setError(result.error);
      } else {
        onClose();
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule Meeting"
      description="Create a new meeting or appointment"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Input name="title" label="Title *" required placeholder="e.g. Initial consultation with Smith family" />

        <Select
          name="meeting_type"
          label="Type"
          options={[
            { value: "general", label: "General" },
            { value: "initial_consultation", label: "Initial Consultation" },
            { value: "strategy_session", label: "Strategy Session" },
            { value: "essay_review", label: "Essay Review" },
            { value: "parent_meeting", label: "Parent Meeting" },
            { value: "check_in", label: "Check-In" },
          ]}
        />

        <div className="grid grid-cols-3 gap-4">
          <Input name="start_date" label="Date *" type="date" required />
          <Input name="start_time" label="Start Time *" type="time" required />
          <Input name="end_time" label="End Time" type="time" />
        </div>

        <Input name="location_text" label="Location" placeholder="e.g. Office, Zoom, etc." />

        <Select
          name="student_id"
          label="Related Student"
          placeholder="None"
          options={students.map((s) => ({ value: s.id, label: s.name }))}
        />

        <Select
          name="attendee_ids"
          label="Add Attendee"
          placeholder="Select staff member"
          options={staff.map((s) => ({ value: s.id, label: s.name }))}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Agenda
          </label>
          <textarea
            name="agenda"
            rows={2}
            placeholder="Meeting agenda..."
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating..." : "Schedule Meeting"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Meeting Detail Modal
// ---------------------------------------------------------------------------
function MeetingDetailModal({
  meeting,
  onClose,
}: {
  meeting: Meeting | null;
  onClose: () => void;
}) {
  const [, startTransition] = useTransition();

  if (!meeting) return null;

  function handleDelete() {
    startTransition(async () => {
      await deleteMeeting(meeting!.id);
      onClose();
    });
  }

  return (
    <Modal open={!!meeting} onClose={onClose} title={meeting.title}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              meetingTypeColor[meeting.meeting_type] ?? meetingTypeColor.general
            }`}
          >
            {meeting.meeting_type.replace(/_/g, " ")}
          </span>
        </div>

        {meeting.scheduled_start_at && (
          <div>
            <p className="text-xs font-medium text-gray-500">When</p>
            <p className="text-sm text-gray-900">
              {format(parseISO(meeting.scheduled_start_at), "EEEE, MMM d, yyyy 'at' h:mm a")}
              {meeting.scheduled_end_at && (
                <> &ndash; {format(parseISO(meeting.scheduled_end_at), "h:mm a")}</>
              )}
            </p>
          </div>
        )}

        {meeting.location_text && (
          <div>
            <p className="text-xs font-medium text-gray-500">Location</p>
            <p className="text-sm text-gray-900">{meeting.location_text}</p>
          </div>
        )}

        {meeting.student_name && (
          <div>
            <p className="text-xs font-medium text-gray-500">Student</p>
            <p className="text-sm text-gray-900">{meeting.student_name}</p>
          </div>
        )}

        {meeting.attendees.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500">Attendees</p>
            <ul className="mt-1 space-y-0.5">
              {meeting.attendees.map((a, i) => (
                <li key={i} className="text-sm text-gray-900">
                  {a.name}
                  {a.status && (
                    <span className="ml-1 text-xs text-gray-400">({a.status})</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {meeting.agenda && (
          <div>
            <p className="text-xs font-medium text-gray-500">Agenda</p>
            <p className="text-sm text-gray-900 whitespace-pre-wrap">{meeting.agenda}</p>
          </div>
        )}

        <div className="flex gap-3 pt-3 border-t border-gray-200">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <button
            onClick={handleDelete}
            className="text-sm text-red-600 hover:text-red-700"
          >
            Delete Meeting
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Calendar Grid
// ---------------------------------------------------------------------------
function CalendarGrid({
  month,
  year,
  meetings,
  onSelectMeeting,
}: {
  month: number;
  year: number;
  meetings: Meeting[];
  onSelectMeeting: (m: Meeting) => void;
}) {
  const monthStart = startOfMonth(new Date(year, month));
  const monthEnd = endOfMonth(monthStart);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  function getMeetingsForDay(day: Date) {
    return meetings.filter(
      (m) =>
        m.scheduled_start_at &&
        isSameDay(parseISO(m.scheduled_start_at), day)
    );
  }

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-gray-200">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-xs font-medium text-gray-500"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayMeetings = getMeetingsForDay(day);
          const inMonth = isSameMonth(day, monthStart);
          const today = isToday(day);

          return (
            <div
              key={day.toISOString()}
              className={`min-h-[100px] border-b border-r border-gray-100 p-1 ${
                !inMonth ? "bg-gray-50" : ""
              }`}
            >
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  today
                    ? "bg-primary-600 text-white font-bold"
                    : inMonth
                      ? "text-gray-900"
                      : "text-gray-300"
                }`}
              >
                {format(day, "d")}
              </span>
              <div className="mt-0.5 space-y-0.5">
                {dayMeetings.slice(0, 3).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onSelectMeeting(m)}
                    className={`block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium ${
                      meetingTypeColor[m.meeting_type] ?? meetingTypeColor.general
                    }`}
                  >
                    {m.scheduled_start_at &&
                      format(parseISO(m.scheduled_start_at), "h:mm")}{" "}
                    {m.title}
                  </button>
                ))}
                {dayMeetings.length > 3 && (
                  <span className="block text-[10px] text-gray-400 px-1">
                    +{dayMeetings.length - 3} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function CalendarClient({
  meetings,
  upcoming,
  deadlines,
  students,
  staff,
  month,
  year,
}: {
  meetings: Meeting[];
  upcoming: UpcomingMeeting[];
  deadlines: Deadline[];
  students: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  month: number;
  year: number;
}) {
  const router = useRouter();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  function navigateMonth(delta: number) {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 0) {
      newMonth = 11;
      newYear--;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear++;
    }
    router.push(`/calendar?month=${newMonth}&year=${newYear}`);
  }

  return (
    <PageShell
      title="Calendar"
      description="View meetings, deadlines, and important dates"
      actions={
        <Button onClick={() => setShowCreateModal(true)}>
          Schedule Meeting
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  {MONTH_NAMES[month]} {year}
                </h2>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigateMonth(-1)}
                  >
                    &larr;
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const now = new Date();
                      router.push(
                        `/calendar?month=${now.getMonth()}&year=${now.getFullYear()}`
                      );
                    }}
                  >
                    Today
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigateMonth(1)}
                  >
                    &rarr;
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <CalendarGrid
                month={month}
                year={year}
                meetings={meetings}
                onSelectMeeting={setSelectedMeeting}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Upcoming Meetings */}
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-gray-900">Upcoming</h2>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <p className="text-sm text-gray-500">No upcoming meetings.</p>
              ) : (
                <ul className="space-y-3">
                  {upcoming.map((m) => (
                    <li key={m.id} className="border-b border-gray-50 pb-2 last:border-0">
                      <p className="text-sm font-medium text-gray-900">
                        {m.title}
                      </p>
                      {m.scheduled_start_at && (
                        <p className="text-xs text-gray-500">
                          {format(
                            parseISO(m.scheduled_start_at),
                            "EEE, MMM d 'at' h:mm a"
                          )}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="default">
                          {m.meeting_type.replace(/_/g, " ")}
                        </Badge>
                        {m.student_name && (
                          <span className="text-xs text-gray-400">
                            {m.student_name}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Application Deadlines */}
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-gray-900">
                Application Deadlines
              </h2>
            </CardHeader>
            <CardContent>
              {deadlines.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No upcoming deadlines.
                </p>
              ) : (
                <ul className="space-y-3">
                  {deadlines.map((d) => (
                    <li key={d.id} className="border-b border-gray-50 pb-2 last:border-0">
                      <p className="text-sm font-medium text-gray-900">
                        {d.college_name}
                      </p>
                      {d.deadline_at && (
                        <p className="text-xs text-gray-500">
                          {format(parseISO(d.deadline_at), "EEE, MMM d, yyyy")}
                        </p>
                      )}
                      {d.student_name && (
                        <span className="text-xs text-gray-400">
                          {d.student_name}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <CreateMeetingModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        students={students}
        staff={staff}
      />

      <MeetingDetailModal
        meeting={selectedMeeting}
        onClose={() => setSelectedMeeting(null)}
      />
    </PageShell>
  );
}
