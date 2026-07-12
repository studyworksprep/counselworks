"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import {
  updateInterview,
  addEngagementEntry,
  removeEngagementEntry,
} from "@/lib/actions/engagement";
import {
  INTERVIEW_STATUSES,
  ENGAGEMENT_TYPES,
  ENGAGEMENT_TYPE_LABELS,
  parseEngagementLog,
  type EngagementEntry,
} from "@/lib/constants/engagement";
import { formatDate } from "@/lib/utils";

/**
 * Interviews & demonstrated interest per list row (fix plan 10.9).
 * Staff-managed; the student portal renders the same data read-only.
 */
export function EngagementModal({
  open,
  onClose,
  studentCollegeId,
  collegeName,
  interviewStatus,
  interviewAt,
  engagementLog,
}: {
  open: boolean;
  onClose: () => void;
  studentCollegeId: string;
  collegeName: string;
  interviewStatus: string | null;
  interviewAt: string | null;
  engagementLog: unknown;
}) {
  const [error, setError] = useState<string | null>(null);
  const [savedInterview, setSavedInterview] = useState(false);
  const [log, setLog] = useState<EngagementEntry[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const entries = log ?? parseEngagementLog(engagementLog);

  function handleInterview(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSavedInterview(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateInterview(studentCollegeId, formData);
      if ("error" in result && result.error) setError(result.error);
      else {
        setSavedInterview(true);
        router.refresh();
      }
    });
  }

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await addEngagementEntry(studentCollegeId, formData);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      if ("log" in result && result.log) setLog(result.log);
      form.reset();
      router.refresh();
    });
  }

  function handleRemove(index: number) {
    startTransition(async () => {
      const result = await removeEngagementEntry(studentCollegeId, index);
      if ("log" in result && result.log) setLog(result.log);
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => !isPending && onClose()}
      title={`Interviews & visits — ${collegeName}`}
      description="Interview progress and the demonstrated-interest log for this college."
    >
      <div className="space-y-5">
        {error && <Alert>{error}</Alert>}

        <form onSubmit={handleInterview} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Select
              name="interview_status"
              label="Interview"
              defaultValue={interviewStatus ?? ""}
              placeholder="Not tracked"
              options={INTERVIEW_STATUSES.map((s) => ({
                value: s.value,
                label: s.label,
              }))}
            />
            <Input
              name="interview_at"
              label="Interview date"
              type="date"
              defaultValue={interviewAt ?? ""}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" loading={isPending}>
              Save Interview
            </Button>
            {savedInterview && (
              <span className="text-sm text-success-700">Saved</span>
            )}
          </div>
        </form>

        <div className="border-t border-gray-100 pt-4">
          <p className="mb-2 text-sm font-medium text-gray-700">
            Demonstrated interest
          </p>
          {entries.length === 0 ? (
            <p className="mb-3 text-sm text-gray-400">
              No activity logged yet.
            </p>
          ) : (
            <ul className="mb-3 divide-y divide-gray-50">
              {entries.map((entry, i) => (
                <li
                  key={`${entry.type}-${entry.date}-${i}`}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <div>
                    <p className="text-sm text-gray-900">
                      <Badge variant="outline">
                        {ENGAGEMENT_TYPE_LABELS[entry.type] ?? entry.type}
                      </Badge>
                      {entry.date && (
                        <span className="ml-2 text-xs text-gray-500">
                          {formatDate(entry.date)}
                        </span>
                      )}
                    </p>
                    {entry.note && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        {entry.note}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemove(i)}
                    disabled={isPending}
                    className="text-xs text-gray-400 hover:text-danger-500"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAdd} className="space-y-3 rounded-lg bg-gray-50 p-3">
            <div className="grid grid-cols-2 gap-3">
              <Select
                name="type"
                label="Activity *"
                required
                placeholder="Select activity"
                options={ENGAGEMENT_TYPES.map((t) => ({
                  value: t.value,
                  label: t.label,
                }))}
              />
              <Input name="date" label="Date" type="date" />
            </div>
            <Input
              name="note"
              label="Note"
              placeholder="e.g. Toured campus, met admissions rep"
            />
            <Button type="submit" size="sm" variant="outline" loading={isPending}>
              Log Activity
            </Button>
          </form>
        </div>
      </div>
    </Modal>
  );
}
