import { notFound } from "next/navigation";
import {
  getDocuments,
  getDocumentRequests,
  getFamilyByIdCached,
} from "@/lib/db/queries";
import type { FamilyStudentSummary } from "@/lib/db/queries";
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
 * Family Documents (fix plan 13.0): documents filed against the household
 * or any of its students, plus the document-request panel for those
 * students; uploads and requests pick from the household's students.
 */
export default async function FamilyDocumentsPage({ params, searchParams }: Props) {
  const [{ id }, filters] = await Promise.all([params, searchParams]);
  const { page, sort } = parseListParams(filters, DOCUMENT_SORT_KEYS);
  const [family, documents, requests] = await Promise.all([
    getFamilyByIdCached(id),
    getDocuments({
      search: filters.search,
      category: filters.category,
      page,
      sort,
      familyId: id,
    }),
    getDocumentRequests({ familyId: id }),
  ]);
  if (!family) return notFound();

  return (
    <DocumentsClient
      documents={documents.rows}
      pagination={{
        page: documents.page,
        pageSize: documents.pageSize,
        total: documents.total,
      }}
      requests={requests}
      students={family.students.map((s: FamilyStudentSummary) => ({
        id: s.id,
        name: `${s.first_name} ${s.last_name}`,
      }))}
      embed={{ basePath: `/families/${id}/documents` }}
    />
  );
}
