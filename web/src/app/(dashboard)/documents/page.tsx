import {
  getDocuments,
  getDocumentRequests,
  getStudentsForSelect,
} from "@/lib/db/queries";
import { parseListParams } from "@/lib/list-params";
import { DocumentsClient } from "./documents-client";

const DOCUMENT_SORT_KEYS = ["title", "category", "created_at"] as const;

interface Props {
  searchParams: Promise<{
    search?: string;
    category?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
}

export default async function DocumentsPage({ searchParams }: Props) {
  const params = await searchParams;
  const { page, sort } = parseListParams(params, DOCUMENT_SORT_KEYS);
  const [documents, requests, students] = await Promise.all([
    getDocuments({
      search: params.search,
      category: params.category,
      page,
      sort,
    }),
    getDocumentRequests(),
    getStudentsForSelect(),
  ]);

  return (
    <DocumentsClient
      documents={documents.rows}
      pagination={{
        page: documents.page,
        pageSize: documents.pageSize,
        total: documents.total,
      }}
      requests={requests}
      students={students}
    />
  );
}
