import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getStudentDocuments,
  getStudentOpenDocumentRequests,
} from "@/lib/db/queries";
import { formatDate } from "@/lib/utils";
import { DownloadButton } from "./download-button";
import { PortalUploadButton } from "@/components/portal/portal-upload-button";
import { OpenDocumentRequests } from "@/components/portal/open-document-requests";

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const categoryLabels: Record<string, string> = {
  transcript: "Transcript",
  recommendation: "Recommendation",
  essay: "Essay",
  test_score: "Test Score",
  financial: "Financial",
  other: "Other",
};

export default async function StudentDocumentsPage() {
  const [documents, openRequests] = await Promise.all([
    getStudentDocuments(),
    getStudentOpenDocumentRequests(),
  ]);

  if (!documents) redirect("/sign-in");

  return (
    <PageShell
      title="My Documents"
      description="Documents shared with you by your counselor"
      actions={<PortalUploadButton />}
    >
      <div className="mb-6 empty:hidden">
        <OpenDocumentRequests requests={openRequests} />
      </div>
      {documents.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-4 text-sm text-gray-500">
              No documents shared yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="pb-2 font-medium">Document</th>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {documents.map((doc) => {
                  const uploader = (doc as Record<string, unknown>).uploader as
                    | { first_name: string; last_name: string }
                    | { first_name: string; last_name: string }[]
                    | null;
                  const uploaderName = uploader
                    ? Array.isArray(uploader)
                      ? `${uploader[0]?.first_name} ${uploader[0]?.last_name}`
                      : `${uploader.first_name} ${uploader.last_name}`
                    : "";

                  return (
                    <tr key={doc.id}>
                      <td className="py-2.5">
                        <p className="font-medium text-gray-900">{doc.title}</p>
                        <p className="text-xs text-gray-400">
                          {formatFileSize(doc.file_size_bytes)}
                          {uploaderName && ` · Uploaded by ${uploaderName}`}
                        </p>
                      </td>
                      <td className="py-2.5">
                        <Badge variant="outline">
                          {categoryLabels[doc.category] ?? doc.category}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-gray-500">
                        {formatDate(doc.created_at)}
                      </td>
                      <td className="py-2.5 text-right">
                        <DownloadButton documentId={doc.id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
