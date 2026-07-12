"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import {
  listDocumentVersions,
  uploadNewDocumentVersion,
} from "@/lib/actions/documents";
import { formatDate } from "@/lib/utils";

interface VersionRow {
  id: string;
  version_number: number;
  created_at: string;
  uploaded_by: string;
}

/**
 * Version history + re-upload (fix plan 10.5). The current file is always
 * the live pointer; superseded files are listed as prior versions.
 */
export function VersionHistoryButton({
  documentId,
  documentTitle,
}: {
  documentId: string;
  documentTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function show() {
    setOpen(true);
    setError(null);
    startTransition(async () => {
      const result = await listDocumentVersions(documentId);
      if ("error" in result && result.error) setError(result.error);
      else setVersions(result.versions ?? []);
    });
  }

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await uploadNewDocumentVersion(documentId, formData);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      const refreshed = await listDocumentVersions(documentId);
      if (!("error" in refreshed) || !refreshed.error) {
        setVersions(refreshed.versions ?? []);
      }
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={show}
        className="text-xs font-medium text-gray-500 hover:text-gray-700"
      >
        History
      </button>
      <Modal
        open={open}
        onClose={() => !isPending && setOpen(false)}
        title={documentTitle}
        description="Version history — uploading a new file keeps prior versions."
      >
        <div className="space-y-4">
          {error && <Alert>{error}</Alert>}
          {versions === null ? (
            <p className="py-2 text-sm text-gray-400">Loading…</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              <li className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-gray-900">
                  Current version
                </span>
                <span className="text-xs text-gray-400">live</span>
              </li>
              {versions.length === 0 ? (
                <li className="py-2 text-sm text-gray-400">
                  No prior versions.
                </li>
              ) : (
                versions.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="text-sm text-gray-600">
                      Version {v.version_number}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDate(v.created_at)} · {v.uploaded_by}
                    </span>
                  </li>
                ))
              )}
            </ul>
          )}

          <form onSubmit={handleUpload} className="space-y-3 border-t border-gray-100 pt-4">
            <label className="block text-sm font-medium text-gray-700">
              Upload new version
            </label>
            <input
              type="file"
              name="file"
              required
              className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-700 hover:file:bg-primary-100"
            />
            <Button type="submit" size="sm" loading={isPending}>
              Upload Version
            </Button>
          </form>
        </div>
      </Modal>
    </>
  );
}
