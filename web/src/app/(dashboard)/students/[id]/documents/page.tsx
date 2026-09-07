import { notFound } from "next/navigation";
import {
  getDocuments,
  getDocumentRequests,
  getStudentByIdCached,
} from "@/lib/db/queries";
import { parseListParams } from "@/lib/list-params";
import { DocumentsClient } from "@/app/(dashboard)/documents/documents-client";

const DOCUMENT_SORT_KEYS = ["title", "category", "created_at"] as const;

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    search?: string;
    category?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
}

/**
 * Student Documents (fix plan 13.0): the firm-wide Documents list and the
 * document-request panel pinned to this student; uploads and requests
 * default to them.
 */
export default async function StudentDocumentsPage({ params, searchParams }: Props) {
  const [{ id }, filters] = await Promise.all([params, searchParams]);
  const { page, sort } = parseListParams(filters, DOCUMENT_SORT_KEYS);
  const [student, documents, requests] = await Promise.all([
    getStudentByIdCached(id),
    getDocuments({
      search: filters.search,
      category: filters.category,
      page,
      sort,
      studentId: id,
    }),
    getDocumentRequests({ studentId: id }),
  ]);
  if (!student) return notFound();

  return (
    <DocumentsClient
      documents={documents.rows}
      pagination={{
        page: documents.page,
        pageSize: documents.pageSize,
        total: documents.total,
      }}
      requests={requests}
      students={[{ id, name: `${student.first_name} ${student.last_name}` }]}
      embed={{ studentId: id, basePath: `/students/${id}/documents` }}
    />
  );
}
