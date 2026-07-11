"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/modals/modal";
import {
  createRecommender,
  updateRecommenderStatus,
  deleteRecommender,
} from "@/lib/actions/recommenders";

export interface RecommenderRow {
  id: string;
  name: string;
  role_title: string | null;
  email: string | null;
  status: string;
  notes: string | null;
}

const STATUS_OPTIONS = [
  { value: "identified", label: "Identified" },
  { value: "asked", label: "Asked" },
  { value: "accepted", label: "Agreed to write" },
  { value: "submitted", label: "Submitted" },
  { value: "declined", label: "Declined" },
];

/**
 * Recommendation-letter tracking: who is writing, and where each letter
 * stands. One status per recommender (Common App model — letters are shared
 * across colleges). Complements the Recommendation Letters workflow template.
 */
export function RecommendersCard({
  studentId,
  recommenders,
}: {
  studentId: string;
  recommenders: RecommenderRow[];
}) {
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("student_id", studentId);
    startTransition(async () => {
      const result = await createRecommender(formData);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setShowModal(false);
      router.refresh();
    });
  }

  function handleStatusChange(id: string, status: string) {
    startTransition(async () => {
      await updateRecommenderStatus(id, status);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Remove this recommender?")) return;
    startTransition(async () => {
      await deleteRecommender(id);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Recommenders</h3>
          <Button size="sm" variant="outline" onClick={() => setShowModal(true)}>
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {recommenders.length === 0 ? (
          <p className="text-sm text-gray-500">
            No recommenders tracked yet. Pair with the Recommendation Letters
            workflow to manage asks and follow-ups.
          </p>
        ) : (
          <ul className="space-y-3">
            {recommenders.map((rec) => (
              <li
                key={rec.id}
                className="flex items-center justify-between gap-2 border-b border-gray-50 pb-2 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {rec.name}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {[rec.role_title, rec.email].filter(Boolean).join(" · ") ||
                      "—"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <select
                    value={rec.status}
                    disabled={isPending}
                    onChange={(e) => handleStatusChange(rec.id, e.target.value)}
                    className="rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleDelete(rec.id)}
                    disabled={isPending}
                    className="text-xs text-gray-400 hover:text-red-600"
                    aria-label="Remove recommender"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Modal
        open={showModal}
        onClose={() => !isPending && setShowModal(false)}
        title="Add recommender"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <Input name="name" label="Name *" required placeholder="e.g. Ms. Rivera" />
          <Input
            name="role_title"
            label="Role"
            placeholder="e.g. AP Chemistry teacher (11th)"
          />
          <Input name="email" label="Email" type="email" placeholder="Optional" />
          <Input name="notes" label="Notes" placeholder="Optional" />
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Adding..." : "Add recommender"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowModal(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
