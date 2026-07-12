import {
  getDocuments,
  getDocumentRequests,
  getStudentsForSelect,
} from "@/lib/db/queries";
import { DocumentsClient } from "./documents-client";

interface Props {
  searchParams: Promise<{ search?: string; category?: string }>;
}

export default async function DocumentsPage({ searchParams }: Props) {
  const params = await searchParams;
  const [documents, requests, students] = await Promise.all([
    getDocuments({ search: params.search, category: params.category }),
    getDocumentRequests(),
    getStudentsForSelect(),
  ]);

  return (
    <DocumentsClient
      documents={documents}
      requests={requests}
      students={students}
    />
  );
}
