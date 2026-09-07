"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
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
  const [selected, setSelected] = useState<Slot | null>(null);
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

  function navigate(next: { student?: string | null; staff?: string | null }) {
    const q = new URLSearchParams();
    const s = next.student === undefined ? studentId : next.student;
    const c = next.staff === undefined ? staffUserId : next.staff;
    if (s) q.set("student", s);
    if (c) q.set("staff", c);
    setSelected(null);
    router.push(`/family-booking${q.toString() ? `?${q}` : ""}`);
  }

  function handleConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await bookMeeting(formData);
      if (result.error) {
        setError(result.error);
        router.refresh(); // stale slot list — repaint with current openings
        return;
      }
      setBooked({ start: result.start!, end: result.end! });
      router.refresh();
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
            Times shown in {tz}. A confirmation email is on its way; the
            meeting is also on your dashboard. To reschedule, message your
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
                setSelected(null);
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
                  disabled={!studentId}
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
                  times in {tz}
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
                  {byDay.map(([day, daySlots]) => (
                    <div key={day}>
                      <p className="mb-2 text-sm font-medium text-gray-800">{day}</p>
                      <div className="flex flex-wrap gap-2">
                        {daySlots.map((s) => {
                          const active = selected?.start === s.start;
                          return (
                            <button
                              key={s.start}
                              type="button"
                              onClick={() => setSelected(s)}
                              aria-pressed={active}
                              className={
                                active
                                  ? "rounded-lg border border-primary-600 bg-primary-600 px-3 py-1.5 text-sm font-medium text-white"
                                  : "rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-primary-400 hover:text-primary-700"
                              }
                            >
                              {formatTime(s.start, tz)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div>
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900">Confirm</h2>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <p className="text-sm text-gray-500">Pick a time to continue.</p>
            ) : (
              <form onSubmit={handleConfirm} className="space-y-3">
                {error && <Alert>{error}</Alert>}
                <input type="hidden" name="student_id" value={studentId ?? ""} />
                <input type="hidden" name="staff_user_id" value={staffUserId ?? ""} />
                <input type="hidden" name="start" value={selected.start} />
                <p className="text-sm text-gray-900">
                  <span className="font-medium">{formatDay(selected.start, tz)}</span>
                  <br />
                  {formatTime(selected.start, tz)} – {formatTime(selected.end, tz)}
                </p>
                <p className="text-sm text-gray-600">
                  With {counselorName}
                  {student && ` · about ${student.first_name}`}
                </p>
                {studentHasPortal && student && (
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      name="include_student"
                      defaultChecked
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
                    rows={3}
                    maxLength={1000}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <Button type="submit" loading={isPending} className="w-full">
                  Confirm booking
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
