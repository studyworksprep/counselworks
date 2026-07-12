"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import {
  requestDocument,
  cancelDocumentRequest,
} from "@/lib/actions/documents";
import { formatDate } from "@/lib/utils";
import type { DocumentRequestRow } from "@/lib/db/queries";

const REQUEST_CATEGORIES = [
  { value: "transcript", label: "Transcript" },
  { value: "recommendation", label: "Recommendation" },
  { value: "essay", label: "Essay" },
  { value: "test_score", label: "Test Score" },
  { value: "financial", label: "Financial" },
  { value: "other", label: "Other" },
];

const STATUS_BADGE: Record<string, { label: string; variant: "warning" | "success" | "default" }> = {
  requested: { label: "Awaiting upload", variant: "warning" },
  fulfilled: { label: "Fulfilled", variant: "success" },
  cancelled: { label: "Cancelled", variant: "default" },
};

/**
 * Staff document-requests surface (fix plan 10.5): create a request, watch
 * its status, cancel it. Portal uploads flip requests to fulfilled.
 */
export function DocumentRequestsPanel({
  requests,
  students,
}: {
  requests: DocumentRequestRow[];
  students: { id: string; name: string }[];
}) {
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await requestDocument(formData);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setShowModal(false);
      router.refresh();
    });
  }

  function handleCancel(requestId: string) {
    startTransition(async () => {
      await cancelDocumentRequest(requestId);
      router.refresh();
    });
  }

  const open = requests.filter((r) => r.status === "requested");
  const settled = requests.filter((r) => r.status !== "requested").slice(0, 5);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Document requests</h3>
            <p className="mt-0.5 text-sm text-gray-500">
              Clients see open requests on their portal and can upload directly
              against them.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowModal(true)}>
            Request Document
          </Button>
        </CardHeader>
        <CardContent>
          {open.length === 0 && settled.length === 0 ? (
            <p className="py-2 text-sm text-gray-500">No requests yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {[...open, ...settled].map((r) => {
                const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.requested;
                return (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {r.title}
                        {r.student_name && (
                          <span className="font-normal text-gray-500">
                            {" "}
                            · {r.student_name}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400">
                        Requested {formatDate(r.created_at)}
                        {r.due_at && <> · due {formatDate(r.due_at)}</>}
                        {r.fulfilled_at && (
                          <> · fulfilled {formatDate(r.fulfilled_at)}</>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      {r.status === "requested" && (
                        <button
                          onClick={() => handleCancel(r.id)}
                          className="text-xs text-gray-400 hover:text-danger-500"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Modal
        open={showModal}
        onClose={() => !isPending && setShowModal(false)}
        title="Request a document"
        description="The family is notified and prompted to upload on their portal."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Input
            name="title"
            label="What do you need? *"
            placeholder="e.g. Junior year transcript"
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              name="category"
              label="Category"
              options={REQUEST_CATEGORIES}
            />
            <Input name="due_at" label="Due date" type="date" />
          </div>
          <Select
            name="student_id"
            label="Student *"
            required
            placeholder="Select student"
            options={students.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Textarea
            name="note"
            label="Note to family"
            placeholder="Optional context, e.g. which school year or format"
            rows={2}
          />
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isPending}>
              Send Request
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowModal(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
