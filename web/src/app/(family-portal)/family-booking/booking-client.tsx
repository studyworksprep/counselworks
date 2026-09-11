"use client";

import { formatTimeZone } from "@/lib/utils";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { bookMeeting } from "@/lib/actions/booking";
import type { BookableCounselor } from "@/lib/db/queries";
import type { Slot } from "@/lib/booking/slots";

interface StudentOption {
  id: string;
  first_name: string;
  last_name: string;
}

function formatDay(iso: string, tz: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: tz,
  });
}

function formatTime(iso: string, tz: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
    timeZoneName: "short",
  });
}

/**
 * Slot picker + confirmation. Slots arrive as UTC instants and are rendered
 * in the parent's browser timezone (labelled), so a family in Denver and a
 * counselor in Boston both see the right wall-clock.
 */
export function BookingClient({
  students,
  counselorsByStudent,
  studentId,
  staffUserId,
  slots,
  slotMinutes,
  counselorName,
  studentHasPortal,
}: {
  students: StudentOption[];
  counselorsByStudent: Record<string, BookableCounselor[]>;
  studentId: string | null;
  staffUserId: string | null;
  slots: Slot[];
  slotMinutes: number | null;
  counselorName: string | null;
  studentHasPortal: boolean;
}) {
  const router = useRouter();
  const context = `${studentId ?? ''}:${staffUserId ?? ''}`;
  const [selection, setSelection] = useState<{slot:Slot;context:string} | null>(null);
  const selected = selection?.context === context ? slots.find(slot=>slot.start===selection.slot.start) ?? null : null;
  const [dayChoice,setDayChoice] = useState<{day:string;context:string} | null>(null);
  const [note,setNote] = useState('');
  const [includeStudent,setIncludeStudent] = useState(true);
  const confirmRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<{ start: string; end: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const tz = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "UTC";
    }
  }, []);

  const student = students.find((s) => s.id === studentId) ?? null;
  const counselors = studentId ? (counselorsByStudent[studentId] ?? []) : [];

  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const key = formatDay(s.start, tz);
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [slots, tz]);

  const activeDay = dayChoice?.context === context && byDay.some(([day])=>day===dayChoice.day) ? dayChoice.day : byDay[0]?.[0];
  const daySlots = byDay.find(([day])=>day===activeDay)?.[1] ?? [];
  const unavailableSelection = !!selection && !selected;
  function chooseDay(day:string) {
    setDayChoice({day,context});
    if(selected && formatDay(selected.start,tz)!==day) {
      setSelection(null);setError("Day changed. Choose a time on this day; your note is saved.");
    }
  }
  function navigate(next: { student?: string | null; staff?: string | null }) {
    const q = new URLSearchParams();
    const s = next.student === undefined ? studentId : next.student;
    const c = next.staff === undefined ? staffUserId : next.staff;
    if (s) q.set("student", s);
    if (c) q.set("staff", c);
    setSelection(null);
    setError("Meeting details changed. Choose a new time; your note is saved.");
    router.push(`/family-booking${q.toString() ? `?${q}` : ""}`);
  }

  function handleConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
      const result = await bookMeeting(formData);
      if (result.error) {
        setError(result.error);
        router.refresh(); // stale slot list — repaint with current openings
        return;
      }
      setBooked({ start: result.start!, end: result.end! });
      router.refresh();
      } catch { setError("Booking could not be confirmed. Your note is saved; check your dashboard before retrying."); }
    });
  }

  if (booked) {
    return (
      <Card>
        <CardContent>
          <h2 className="text-lg font-semibold text-gray-900">You&apos;re booked</h2>
          <p className="mt-2 text-sm text-gray-700">
            {formatDay(booked.start, tz)} at {formatTime(booked.start, tz)}
            {" – "}
            {formatTime(booked.end, tz)} with {counselorName}
            {student && ` about ${student.first_name}`}.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Times shown in {formatTimeZone(tz, booked.start)}. The meeting is saved on your dashboard. To reschedule, message your
            counselor.
          </p>
          <div className="mt-4 flex gap-3">
            <Link
              href="/family-dashboard"
              className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
            >
              Back to dashboard
            </Link>
            <button
              type="button"
              onClick={() => {
                setBooked(null);
                setSelection(null);setNote('');setError(null);
              }}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Book another
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900">Who is this meeting for?</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="booking-student" className="mb-1 block text-xs font-medium text-gray-500">
                  Student
                </label>
                <select
                  disabled={isPending}
                  id="booking-student"
                  value={studentId ?? ""}
                  onChange={(e) => navigate({ student: e.target.value || null, staff: null })}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {!studentId && <option value="">Choose a student</option>}
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="booking-counselor" className="mb-1 block text-xs font-medium text-gray-500">
                  Counselor
                </label>
                <select
                  id="booking-counselor"
                  value={staffUserId ?? ""}
                  onChange={(e) => navigate({ staff: e.target.value || null })}
                  disabled={!studentId || isPending}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
                >
                  {!staffUserId && <option value="">Choose a counselor</option>}
                  {counselors.map((c) => (
                    <option key={c.user_id} value={c.user_id}>
                      {c.name}
                      {c.is_primary ? " (primary)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {studentId && staffUserId && (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold text-gray-900">Open times</h2>
                <span className="text-xs text-gray-500">
                  {slotMinutes ? `${slotMinutes}-minute meetings · ` : ""}
                  times in {tz.replaceAll("_", " ")} (local time at each appointment)
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {byDay.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No open times right now. Check back soon or message your
                  counselor.
                </p>
              ) : (
                <div className="space-y-4">
                  <label className="block text-sm font-medium" htmlFor="booking-day">Choose a day</label>
                  <select id="booking-day" disabled={isPending} value={activeDay ?? ''} onChange={event=>chooseDay(event.target.value)} className="w-full rounded-lg border border-gray-300 p-3 text-sm">
                    {byDay.map(([day])=><option key={day} value={day}>{day}</option>)}
                  </select>
                  <div className="flex max-h-72 flex-wrap gap-2 overflow-y-auto p-1" role="group" aria-label={`Open times for ${activeDay}`}>
                    {daySlots.map(slot=><button key={slot.start} type="button" disabled={isPending} aria-pressed={selected?.start===slot.start}
                      onClick={()=>{setSelection({slot,context});setError(null);}}
                      className={selected?.start===slot.start ? "rounded-lg border border-primary-600 bg-primary-600 px-3 py-2 text-sm text-white" : "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:border-primary-500"}>
                      {formatTime(slot.start,tz)}
                    </button>)}
                  </div>
                  {selected && <div className="border-t pt-3"><p className="mb-3 text-sm">Selected: {formatDay(selected.start,tz)} at {formatTime(selected.start,tz)}</p><Button type="button" onClick={()=>{confirmRef.current?.scrollIntoView({block:'nearest'});confirmRef.current?.focus();}}>Continue</Button></div>}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div ref={confirmRef} tabIndex={-1} className="min-w-0 self-start rounded-xl focus-visible:outline-2 focus-visible:outline-primary-600 lg:sticky lg:top-4">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900">Confirm your meeting</h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleConfirm} className="space-y-3">
                {error && <Alert>{error}</Alert>}
                {unavailableSelection && <Alert variant="warning">That selection is no longer available. Choose another time; your note is saved.</Alert>}
                {!selected && <p className="text-sm text-gray-500">Pick a time to continue.</p>}
                <input type="hidden" name="student_id" value={studentId ?? ""} />
                <input type="hidden" name="staff_user_id" value={staffUserId ?? ""} />
                <input type="hidden" name="start" value={selected?.start ?? ''} />
                {selected && <p className="text-sm text-gray-900">
                  <span className="font-medium">{formatDay(selected.start, tz)}</span>
                  <br />
                  {formatTime(selected.start, tz)} – {formatTime(selected.end, tz)}
                </p>}
                {counselorName && <p className="text-sm text-gray-600">
                  With {counselorName}
                  {student && ` · about ${student.first_name}`}
                </p>}
                {studentHasPortal && student && (
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      name="include_student"
                      disabled={isPending}
                      checked={includeStudent}
                      onChange={event=>setIncludeStudent(event.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    Invite {student.first_name} too
                  </label>
                )}
                <div>
                  <label htmlFor="booking-note" className="mb-1 block text-xs font-medium text-gray-500">
                    Anything your counselor should know? (optional)
                  </label>
                  <textarea
                    id="booking-note"
                    name="note"
                    disabled={isPending}
                    value={note}
                    onChange={event=>setNote(event.target.value)}
                    rows={3}
                    maxLength={1000}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <Button type="submit" disabled={!selected} loading={isPending} className="w-full">
                  Confirm booking
                </Button>
              </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
