"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { saveTestSitting, deleteTestSitting } from "@/lib/actions/testing";
import {
  TEST_TYPES,
  TEST_TYPE_LABELS,
  SITTING_STATUSES,
  SITTING_STATUS_LABELS,
  SITTING_STATUS_BADGES,
  registrationNeedsAttention,
} from "@/lib/constants/testing";
import { formatDate } from "@/lib/utils";
import type { TestSittingRow } from "@/lib/db/queries";

type BadgeVariant = "default" | "primary" | "success" | "warning" | "danger";

/**
 * Testing plan (fix plan 10.6). Staff manage sittings; the student portal
 * mounts the same card read-only.
 */
export function TestingPlanCard({
  studentId,
  sittings,
  readOnly = false,
}: {
  studentId: string;
  sittings: TestSittingRow[];
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState<TestSittingRow | null | "new">(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const today = new Date().toISOString().slice(0, 10);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await saveTestSitting(studentId, formData);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  }

  function handleDelete(sittingId: string) {
    startTransition(async () => {
      await deleteTestSitting(sittingId);
      router.refresh();
    });
  }

  const current = editing !== null && editing !== "new" ? editing : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Testing Plan</h3>
            <p className="mt-0.5 text-sm text-gray-500">
              Planned sittings and registration deadlines
            </p>
          </div>
          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(editing === "new" ? null : "new")}
            >
              {editing === "new" ? "Close" : "Add Sitting"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && <Alert className="mb-3">{error}</Alert>}

        {editing !== null && !readOnly && (
          <form
            onSubmit={handleSubmit}
            className="mb-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4"
          >
            {current && (
              <input type="hidden" name="sitting_id" value={current.id} />
            )}
            <div className="grid grid-cols-2 gap-3">
              <Select
                name="test_type"
                label="Test *"
                required
                defaultValue={current?.test_type ?? ""}
                placeholder="Select test"
                options={TEST_TYPES.map((t) => ({
                  value: t.value,
                  label: t.label,
                }))}
              />
              <Select
                name="status"
                label="Status"
                defaultValue={current?.status ?? "planned"}
                options={SITTING_STATUSES.map((s) => ({
                  value: s.value,
                  label: s.label,
                }))}
              />
              <Input
                name="test_date"
                label="Test date"
                type="date"
                defaultValue={current?.test_date ?? ""}
              />
              <Input
                name="registration_deadline"
                label="Registration deadline"
                type="date"
                defaultValue={current?.registration_deadline ?? ""}
              />
              <Input
                name="score"
                label="Score"
                placeholder="After completion"
                defaultValue={current?.score ?? ""}
              />
              <Input
                name="notes"
                label="Notes"
                defaultValue={current?.notes ?? ""}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={isPending}>
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        {sittings.length === 0 ? (
          <p className="text-sm text-gray-500">
            No sittings planned yet.
            {readOnly && " Your counselor will build your testing plan."}
          </p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {sittings.map((s) => {
              const urgent = registrationNeedsAttention(s, today);
              return (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {TEST_TYPE_LABELS[s.test_type] ?? s.test_type}
                      {s.test_date && (
                        <span className="font-normal text-gray-500">
                          {" "}
                          · {formatDate(s.test_date)}
                        </span>
                      )}
                      {s.score && (
                        <span className="font-normal text-gray-700">
                          {" "}
                          · {s.score}
                        </span>
                      )}
                    </p>
                    {s.registration_deadline && s.status === "planned" && (
                      <p
                        className={`text-xs ${
                          urgent
                            ? "font-medium text-danger-500"
                            : "text-gray-400"
                        }`}
                      >
                        Register by {formatDate(s.registration_deadline)}
                        {urgent && " — deadline approaching"}
                      </p>
                    )}
                    {s.notes && (
                      <p className="text-xs text-gray-400">{s.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        (SITTING_STATUS_BADGES[s.status] as BadgeVariant) ??
                        "default"
                      }
                    >
                      {SITTING_STATUS_LABELS[s.status] ?? s.status}
                    </Badge>
                    {!readOnly && (
                      <>
                        <button
                          onClick={() => setEditing(s)}
                          className="text-xs font-medium text-primary-600 hover:text-primary-700"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(s.id)}
                          disabled={isPending}
                          className="text-xs text-gray-400 hover:text-danger-500"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
