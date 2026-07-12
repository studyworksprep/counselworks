"use client";

import { useState, useTransition, useRef } from "react";
import { useDebouncedFilter } from "@/lib/hooks/use-debounced-filter";
import { format, parseISO } from "date-fns";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/tables/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import {
  uploadDocument,
  getDocumentDownloadUrl,
  archiveDocument,
} from "@/lib/actions/documents";
import { DocumentRequestsPanel } from "@/components/documents/document-requests-panel";
import { VersionHistoryButton } from "@/components/documents/version-history-button";
import type { DocumentRequestRow } from "@/lib/db/queries";

interface DocumentRow {
  id: string;
  title: string;
  category: string;
  mime_type: string;
  file_size_bytes: number | null;
  storage_key: string;
  visibility_scope: string;
  created_at: string;
  student_name: string | null;
  uploaded_by: string;
}

function formatFileSize(bytes: number | null) {
  if (bytes == null) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Upload Modal
// ---------------------------------------------------------------------------
function UploadModal({
  open,
  onClose,
  students,
}: {
  open: boolean;
  onClose: () => void;
  students: { id: string; name: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await uploadDocument(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setFileName(null);
        onClose();
      }
    });
  }

  function handleClose() {
    setError(null);
    setFileName(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Upload Document"
      description="Upload a file associated with a student or the firm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert>{error}</Alert>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            File *
          </label>
          <div
            onClick={() => fileRef.current?.click()}
            className="cursor-pointer rounded-lg border-2 border-dashed border-gray-300 p-6 text-center hover:border-primary-400 transition-colors"
          >
            <input
              ref={fileRef}
              type="file"
              name="file"
              required
              className="hidden"
              onChange={(e) =>
                setFileName(e.target.files?.[0]?.name ?? null)
              }
            />
            {fileName ? (
              <p className="text-sm text-gray-900 font-medium">{fileName}</p>
            ) : (
              <p className="text-sm text-gray-500">
                Click to select a file
              </p>
            )}
          </div>
        </div>

        <Input
          name="title"
          label="Title"
          placeholder="Optional — defaults to file name"
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            name="category"
            label="Category"
            required
            placeholder="Select category"
            options={[
              { value: "transcript", label: "Transcript" },
              { value: "recommendation", label: "Recommendation" },
              { value: "essay", label: "Essay" },
              { value: "test_score", label: "Test Score" },
              { value: "financial", label: "Financial" },
              { value: "other", label: "Other" },
            ]}
          />
          <Select
            name="visibility_scope"
            label="Visibility"
            options={[
              { value: "staff", label: "Staff Only" },
              { value: "student", label: "Student Visible" },
              { value: "family", label: "Family Visible" },
            ]}
          />
        </div>

        <Select
          name="student_id"
          label="Related Student"
          placeholder="None (firm-level document)"
          options={students.map((s) => ({ value: s.id, label: s.name }))}
        />

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={isPending}>
            Upload
          </Button>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function DocumentsClient({
  documents,
  requests,
  students,
}: {
  documents: DocumentRow[];
  requests: DocumentRequestRow[];
  students: { id: string; name: string }[];
}) {
  const { searchParams, setParam, setSearchParamDebounced } =
    useDebouncedFilter("/documents");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [, startTransition] = useTransition();

  async function handleDownload(docId: string) {
    const result = await getDocumentDownloadUrl(docId);
    if (result.url) {
      window.open(result.url, "_blank");
    }
  }

  function handleDelete(docId: string) {
    startTransition(async () => {
      await archiveDocument(docId);
    });
  }

  const columns: Column<DocumentRow>[] = [
    {
      key: "title",
      header: "Document",
      sortValue: (row) => row.title,
      render: (row) => (
        <div>
          <span className="font-medium text-gray-900">{row.title}</span>
          <p className="text-xs text-gray-400 mt-0.5">
            {formatFileSize(row.file_size_bytes)}
          </p>
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      sortValue: (row) => row.category,
      render: (row) => <Badge variant="default">{row.category}</Badge>,
    },
    {
      key: "student_name",
      header: "Student",
      sortValue: (row) => row.student_name,
      render: (row) => (
        <span className="text-gray-600">{row.student_name ?? "--"}</span>
      ),
    },
    {
      key: "uploaded_by",
      header: "Uploaded By",
      render: (row) => (
        <span className="text-gray-600">{row.uploaded_by}</span>
      ),
    },
    {
      key: "created_at",
      header: "Date",
      sortValue: (row) => row.created_at,
      render: (row) => (
        <span className="text-gray-600 text-sm">
          {format(parseISO(row.created_at), "MMM d, yyyy")}
        </span>
      ),
    },
    {
      key: "visibility_scope",
      header: "Visibility",
      render: (row) => (
        <Badge variant="outline">
          {row.visibility_scope.replace("_", " ")}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => handleDownload(row.id)}
            className="text-primary-600 hover:text-primary-700 text-xs font-medium"
          >
            Download
          </button>
          <VersionHistoryButton documentId={row.id} documentTitle={row.title} />
          <button
            onClick={() => handleDelete(row.id)}
            className="text-gray-400 hover:text-danger-500 text-xs"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="Documents"
      description="Manage files and documents"
      actions={
        <Button onClick={() => setShowUploadModal(true)}>
          Upload Document
        </Button>
      }
    >
      <div className="mb-6">
        <DocumentRequestsPanel requests={requests} students={students} />
      </div>

      <Card>
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <Input
              placeholder="Search documents..."
              defaultValue={searchParams.get("search") ?? ""}
              onChange={(e) => setSearchParamDebounced("search", e.target.value)}
              className="max-w-xs"
            />
            <Select
              placeholder="All categories"
              value={searchParams.get("category") ?? ""}
              onChange={(e) => setParam("category", e.target.value)}
              options={[
                { value: "transcript", label: "Transcript" },
                { value: "recommendation", label: "Recommendation" },
                { value: "essay", label: "Essay" },
                { value: "test_score", label: "Test Score" },
                { value: "financial", label: "Financial" },
                { value: "other", label: "Other" },
              ]}
              className="w-44"
            />
            <span className="text-sm text-gray-500">
              {documents.length} document{documents.length !== 1 && "s"}
            </span>
          </div>
        </div>

        {documents.length === 0 ? (
          <EmptyState
            title="No documents yet"
            description="Upload documents to organize transcripts, recommendations, essays, and more."
            actionLabel="Upload Document"
            onAction={() => setShowUploadModal(true)}
          />
        ) : (
          <DataTable
            columns={columns}
            data={documents}
            keyExtractor={(d) => d.id}
            initialSort={{ key: "created_at", dir: "desc" }}
          />
        )}
      </Card>

      <UploadModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        students={students}
      />
    </PageShell>
  );
}
