"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import { uploadDocument } from "@/lib/actions/documents";
import { formatDate } from "@/lib/utils";
import type { DocumentRequestRow } from "@/lib/db/queries";

/**
 * Portal surface for open document requests (fix plan 10.5). Uploading
 * against a request marks it fulfilled and notifies the requesting counselor.
 */
export function OpenDocumentRequests({
  requests,
}: {
  requests: DocumentRequestRow[];
}) {
  const [active, setActive] = useState<DocumentRequestRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (requests.length === 0) return null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await uploadDocument(formData);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setActive(null);
      router.refresh();
    });
  }

  return (
    <>
      <Card className="border-warning-200 bg-warning-50">
        <CardContent>
          <h3 className="font-semibold text-gray-900">
            Your counselor is waiting on{" "}
            {requests.length === 1 ? "a document" : `${requests.length} documents`}
          </h3>
          <ul className="mt-3 divide-y divide-warning-200/60">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{r.title}</p>
                  <p className="text-xs text-gray-500">
                    {r.student_name && <>For {r.student_name} · </>}
                    Requested by {r.requested_by}
                    {r.due_at && <> · due {formatDate(r.due_at)}</>}
                  </p>
                  {r.note && (
                    <p className="mt-0.5 text-xs text-gray-600">{r.note}</p>
                  )}
                </div>
                <Button size="sm" onClick={() => setActive(r)}>
                  Upload
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Modal
        open={active !== null}
        onClose={() => !isPending && setActive(null)}
        title={active ? `Upload: ${active.title}` : "Upload"}
        description="Your file goes straight to your counseling team."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          {active && (
            <>
              <input type="hidden" name="request_id" value={active.id} />
              <input type="hidden" name="title" value={active.title} />
              <input type="hidden" name="category" value={active.category} />
              {active.student_id && (
                <input
                  type="hidden"
                  name="student_id"
                  value={active.student_id}
                />
              )}
            </>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              File *
            </label>
            <input
              type="file"
              name="file"
              required
              className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isPending}>
              Upload
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setActive(null)}
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
