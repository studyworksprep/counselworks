"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import { uploadDocument } from "@/lib/actions/documents";

const PORTAL_CATEGORIES = [
  { value: "transcript", label: "Transcript" },
  { value: "test_score", label: "Test Score Report" },
  { value: "financial", label: "Financial Document" },
  { value: "essay", label: "Essay / Writing" },
  { value: "other", label: "Other" },
];

/**
 * Portal document upload (student & family portals). Uploads land as
 * family-visible documents on the student's record — the server pins the
 * scope regardless of what the client sends.
 */
export function PortalUploadButton({
  students,
}: {
  /** Parent portal passes the children to pick from; student portal omits. */
  students?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

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
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Upload Document
      </Button>
      <Modal
        open={open}
        onClose={() => !isPending && setOpen(false)}
        title="Upload a document"
        description="Share a transcript, score report, or other file with your counselor."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert>{error}</Alert>
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
          <Input name="title" label="Title" placeholder="Defaults to file name" />
          <Select
            name="category"
            label="Category"
            options={PORTAL_CATEGORIES}
          />
          {students && students.length > 0 && (
            <Select
              name="student_id"
              label="Student"
              options={students.map((s) => ({ value: s.id, label: s.name }))}
            />
          )}
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isPending}>
              Upload
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
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
