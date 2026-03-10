"use client";

import { useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable, type Column } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";

interface DocumentRow {
  id: string;
  title: string;
  category: string;
  student_name: string | null;
  uploaded_by: string;
  created_at: string;
  visibility_scope: string;
}

const columns: Column<DocumentRow>[] = [
  {
    key: "title",
    header: "Document",
    render: (row) => (
      <span className="font-medium text-gray-900">{row.title}</span>
    ),
  },
  {
    key: "category",
    header: "Category",
    render: (row) => <Badge variant="default">{row.category}</Badge>,
  },
  {
    key: "student_name",
    header: "Student",
    render: (row) => (
      <span className="text-gray-600">{row.student_name ?? "--"}</span>
    ),
  },
  {
    key: "uploaded_by",
    header: "Uploaded By",
  },
  {
    key: "created_at",
    header: "Date",
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
];

export default function DocumentsPage() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const documents: DocumentRow[] = [];

  return (
    <PageShell
      title="Documents"
      description="Manage files and documents"
      actions={<Button>Upload Document</Button>}
    >
      <Card>
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <Input
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select
              placeholder="All categories"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
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
          </div>
        </div>

        {documents.length === 0 ? (
          <EmptyState
            title="No documents yet"
            description="Upload documents to organize transcripts, recommendations, essays, and more."
            actionLabel="Upload Document"
          />
        ) : (
          <DataTable
            columns={columns}
            data={documents}
            keyExtractor={(d) => d.id}
          />
        )}
      </Card>
    </PageShell>
  );
}
