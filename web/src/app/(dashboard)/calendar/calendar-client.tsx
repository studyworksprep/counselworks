"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import { createMeeting, updateMeeting, deleteMeeting } from "@/lib/actions/meetings";
import { localTzOffsetMinutes } from "@/lib/meetings/logic";

/**
 * Meeting times are stored in UTC. The server never guesses a timezone
 * (fix plan 7.2) — attach the browser's UTC offset for the chosen date
 * (DST-correct) so the wall-clock the counselor typed is what everyone sees.
 */
function attachTzOffset(formData: FormData) {
  const startDate = formData.get("start_date") as string;
  const startTime = formData.get("start_time") as string;
  if (startDate && startTime) {
    formData.set(
      "tz_offset_minutes",
      String(localTzOffsetMinutes(startDate, startTime))
    );
  }
}

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
  student_id: string | null;
  student_name: string | null;
  attendees: { user_id: string; name: string; status: string | null }[];
}

type ClientsByStudent = Record<
  string,
  { id: string; name: string; role: "student" | "parent" }[]
>;

const MEETING_TYPE_OPTIONS = [
  { value: "general", label: "General" },
  { value: "initial_consultation", label: "Initial Consultation" },
  { value: "strategy_session", label: "Strategy Session" },
  { value: "essay_review", label: "Essay Review" },
  { value: "parent_meeting", label: "Parent Meeting" },
  { value: "check_in", label: "Check-In" },
];

/**
 * Attendee picker: staff plus the selected student's portal clients.
 * Client attendees make the meeting visible in the matching portal.
 */
function AttendeePicker({
  staff,
  clients,
  selected,
  onToggle,
}: {
  staff: { id: string; name: string }[];
  clients: { id: string; name: string; role: "student" | "parent" }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const hasParent = clients.some(
    (c) => selected.has(c.id) && c.role === "parent"
  );
  const hasStudent = clients.some((c) => selected.has(c.id));
  const audience = hasParent
    ? "Visible in the family portal"
    : hasStudent
      ? "Visible in the student portal"
      : "Staff only";

  // Attendees selected but not renderable (e.g. the related student was
  // changed, so the old household no longer appears) have no checkbox and
  // will be dropped on save — say so instead of dropping them silently.
  const visibleIds = new Set([
    ...clients.map((c) => c.id),
    ...staff.map((s) => s.id),
  ]);
  const hiddenCount = [...selected].filter((id) => !visibleIds.has(id)).length;

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        Attendees
      </label>
      <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-lg border border-gray-200 p-3">
        {clients.length > 0 && (
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Student &amp; family
          </p>
        )}
        {clients.map((c) => (
          <label
            key={c.id}
            className="flex items-center gap-2 text-sm text-gray-700"
          >
            <input
              type="checkbox"
              name="attendee_ids"
              value={c.id}
              checked={selected.has(c.id)}
              onChange={() => onToggle(c.id)}
              className="h-4 w-4 rounded border-gray-300"
            />
            {c.name}
            <Badge variant="default">{c.role}</Badge>
          </label>
        ))}
        <p className="pt-1 text-xs font-medium uppercase tracking-wide text-gray-400">
          Staff
        </p>
        {staff.map((s) => (
          <label
            key={s.id}
            className="flex items-center gap-2 text-sm text-gray-700"
          >
            <input
              type="checkbox"
              name="attendee_ids"
              value={s.id}
              checked={selected.has(s.id)}
              onChange={() => onToggle(s.id)}
              className="h-4 w-4 rounded border-gray-300"
            />
            {s.name}
          </label>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-gray-500">
        Audience after save: <span className="font-medium">{audience}</span>
      </p>
      {hiddenCount > 0 && (
        <p className="mt-1 text-xs text-amber-600">
          {hiddenCount} previously invited attendee
          {hiddenCount > 1 ? "s are" : " is"} no longer in the list above and
          will be removed when you save.
        </p>
      )}
    </div>
  );
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
  initial_consultation: "bg-success-100 text-success-700",
  strategy_session: "bg-purple-100 text-purple-700",
  essay_review: "bg-orange-100 text-orange-700",
  parent_meeting: "bg-warning-100 text-warning-700",
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
  clientsByStudent,
}: {
  open: boolean;
  onClose: () => void;
  students: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  clientsByStudent: ClientsByStudent;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [studentId, setStudentId] = useState("");
  const [selectedAttendees, setSelectedAttendees] = useState<Set<string>>(
    new Set()
  );

  function toggleAttendee(id: string) {
    setSelectedAttendees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    attachTzOffset(formData);
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
          <Alert>{error}</Alert>
        )}

        <Input name="title" label="Title" required placeholder="e.g. Initial consultation with Smith family" />

        <Select
          name="meeting_type"
          label="Type"
          options={MEETING_TYPE_OPTIONS}
        />

        <div className="grid grid-cols-3 gap-4">
          <Input name="start_date" label="Date" type="date" required />
          <Input name="start_time" label="Start Time" type="time" required />
          <Input name="end_time" label="End Time" type="time" />
        </div>

        <Input name="location_text" label="Location" placeholder="e.g. Office, Zoom, etc." />

        <Select
          name="student_id"
          label="Related Student"
          placeholder="None"
          options={students.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(e) => setStudentId(e.target.value)}
        />

        <AttendeePicker
          staff={staff}
          clients={studentId ? (clientsByStudent[studentId] ?? []) : []}
          selected={selectedAttendees}
          onToggle={toggleAttendee}
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
          <Button type="submit" loading={isPending}>
            Schedule Meeting
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
// Meeting Detail Modal (with edit support)
// ---------------------------------------------------------------------------
function MeetingDetailModal({
  meeting,
  onClose,
  students,
  staff,
  clientsByStudent,
}: {
  meeting: Meeting | null;
  onClose: () => void;
  students: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  clientsByStudent: ClientsByStudent;
}) {
  const confirmDialog = useConfirm();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [studentId, setStudentId] = useState<string>("");
  const [selectedAttendees, setSelectedAttendees] = useState<Set<string>>(
    new Set()
  );

  if (!meeting) return null;

  function startEditing() {
    // Initialize edit state from the current meeting so saving without
    // touching a field never silently clears it.
    setStudentId(meeting!.student_id ?? "");
    setSelectedAttendees(new Set(meeting!.attendees.map((a) => a.user_id)));
    setEditing(true);
  }

  function toggleAttendee(id: string) {
    setSelectedAttendees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete() {
    if (!(await confirmDialog({ title: "Delete this meeting?", body: "This cannot be undone.", destructive: true, confirmLabel: "Delete" }))) return;
    startTransition(async () => {
      await deleteMeeting(meeting!.id);
      onClose();
    });
  }

  function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    attachTzOffset(formData);
    startTransition(async () => {
      const result = await updateMeeting(meeting!.id, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setEditing(false);
        onClose();
      }
    });
  }

  function handleClose() {
    setEditing(false);
    setError(null);
    onClose();
  }

  if (editing) {
    const startDate = meeting.scheduled_start_at
      ? format(parseISO(meeting.scheduled_start_at), "yyyy-MM-dd")
      : "";
    const startTime = meeting.scheduled_start_at
      ? format(parseISO(meeting.scheduled_start_at), "HH:mm")
      : "";
    const endTime = meeting.scheduled_end_at
      ? format(parseISO(meeting.scheduled_end_at), "HH:mm")
      : "";

    return (
      <Modal open={!!meeting} onClose={handleClose} title="Edit Meeting" size="lg">
        <form onSubmit={handleUpdate} className="space-y-4">
          {error && (
            <Alert>{error}</Alert>
          )}

          <Input name="title" label="Title" required defaultValue={meeting.title} />

          <Select
            name="meeting_type"
            label="Type"
            defaultValue={meeting.meeting_type}
            options={MEETING_TYPE_OPTIONS}
          />

          <div className="grid grid-cols-3 gap-4">
            <Input name="start_date" label="Date" type="date" required defaultValue={startDate} />
            <Input name="start_time" label="Start Time" type="time" required defaultValue={startTime} />
            <Input name="end_time" label="End Time" type="time" defaultValue={endTime} />
          </div>

          <Input name="location_text" label="Location" defaultValue={meeting.location_text ?? ""} />

          <Select
            name="student_id"
            label="Related Student"
            placeholder="None"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            options={students.map((s) => ({ value: s.id, label: s.name }))}
          />

          <AttendeePicker
            staff={staff}
            clients={studentId ? (clientsByStudent[studentId] ?? []) : []}
            selected={selectedAttendees}
            onToggle={toggleAttendee}
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Agenda
            </label>
            <textarea
              name="agenda"
              rows={2}
              defaultValue={meeting.agenda ?? ""}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Meeting Summary
            </label>
            <textarea
              name="summary"
              rows={3}
              defaultValue={meeting.summary ?? ""}
              placeholder="Post-meeting notes and outcomes..."
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isPending}>
              Save Changes
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <Modal open={!!meeting} onClose={handleClose} title={meeting.title}>
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

        {meeting.summary && (
          <div>
            <p className="text-xs font-medium text-gray-500">Summary</p>
            <p className="text-sm text-gray-900 whitespace-pre-wrap">{meeting.summary}</p>
          </div>
        )}

        <div className="flex gap-3 pt-3 border-t border-gray-200">
          <Button variant="outline" onClick={startEditing}>Edit</Button>
          <Button variant="outline" onClick={handleClose}>Close</Button>
          <button
            onClick={handleDelete}
            className="text-sm text-danger-600 hover:text-danger-700"
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
  onSelectDay,
}: {
  month: number;
  year: number;
  meetings: Meeting[];
  onSelectMeeting: (m: Meeting) => void;
  onSelectDay: (day: Date) => void;
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
                  <button
                    type="button"
                    onClick={() => onSelectDay(day)}
                    className="block w-full px-1 text-left text-[10px] font-medium text-primary-600 hover:text-primary-700"
                  >
                    +{dayMeetings.length - 3} more
                  </button>
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
  clientsByStudent,
  month,
  year,
}: {
  meetings: Meeting[];
  upcoming: UpcomingMeeting[];
  deadlines: Deadline[];
  students: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  clientsByStudent: ClientsByStudent;
  month: number;
  year: number;
}) {
  const router = useRouter();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [view, setView] = useState<"month" | "agenda">("month");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const dayMeetings = selectedDay
    ? meetings
        .filter(
          (m) =>
            m.scheduled_start_at &&
            isSameDay(parseISO(m.scheduled_start_at), selectedDay)
        )
        .sort((a, b) =>
          (a.scheduled_start_at ?? "").localeCompare(b.scheduled_start_at ?? "")
        )
    : [];

  const agendaDays = (() => {
    const byDay = new Map<string, Meeting[]>();
    for (const m of meetings) {
      if (!m.scheduled_start_at) continue;
      const key = format(parseISO(m.scheduled_start_at), "yyyy-MM-dd");
      byDay.set(key, [...(byDay.get(key) ?? []), m]);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, list]) => ({
        key,
        list: list.sort((a, b) =>
          (a.scheduled_start_at ?? "").localeCompare(b.scheduled_start_at ?? "")
        ),
      }));
  })();

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
                    variant={view === "month" ? "outline" : "ghost"}
                    size="sm"
                    onClick={() => setView("month")}
                  >
                    Month
                  </Button>
                  <Button
                    variant={view === "agenda" ? "outline" : "ghost"}
                    size="sm"
                    onClick={() => setView("agenda")}
                  >
                    Agenda
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigateMonth(-1)}
                    aria-label="Previous month"
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
                    aria-label="Next month"
                  >
                    &rarr;
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {view === "month" ? (
                <CalendarGrid
                  month={month}
                  year={year}
                  meetings={meetings}
                  onSelectMeeting={setSelectedMeeting}
                  onSelectDay={setSelectedDay}
                />
              ) : agendaDays.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-gray-500">
                  No meetings this month.
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {agendaDays.map(({ key, list }) => (
                    <div key={key} className="px-6 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {format(parseISO(`${key}T00:00`), "EEEE, MMM d")}
                      </p>
                      <ul className="mt-1 space-y-1">
                        {list.map((m) => (
                          <li key={m.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedMeeting(m)}
                              className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-50"
                            >
                              <span className="w-16 shrink-0 tabular-nums text-xs text-gray-500">
                                {m.scheduled_start_at
                                  ? format(parseISO(m.scheduled_start_at), "h:mm a")
                                  : ""}
                              </span>
                              <span className="font-medium text-gray-900">
                                {m.title}
                              </span>
                              {m.student_name && (
                                <span className="text-xs text-gray-400">
                                  {m.student_name}
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
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
        clientsByStudent={clientsByStudent}
      />

      <Modal
        open={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? format(selectedDay, "EEEE, MMM d") : ""}
      >
        <ul className="space-y-1">
          {dayMeetings.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedDay(null);
                  setSelectedMeeting(m);
                }}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-gray-50"
              >
                <span className="w-16 shrink-0 tabular-nums text-xs text-gray-500">
                  {m.scheduled_start_at
                    ? format(parseISO(m.scheduled_start_at), "h:mm a")
                    : ""}
                </span>
                <span className="font-medium text-gray-900">{m.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      <MeetingDetailModal
        meeting={selectedMeeting}
        onClose={() => setSelectedMeeting(null)}
        students={students}
        staff={staff}
        clientsByStudent={clientsByStudent}
      />
    </PageShell>
  );
}
