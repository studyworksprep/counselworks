"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { getDocumentDownloadUrl } from "@/lib/actions/documents";

/** Opens the invoice's archived PDF (a family-visible documents row). */
export function InvoiceDownloadButton({ documentId }: { documentId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleDownload() {
    startTransition(async () => {
      const result = await getDocumentDownloadUrl(documentId);
      if ("url" in result && result.url) {
        window.open(result.url, "_blank");
      }
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleDownload} loading={isPending}>
      PDF
    </Button>
  );
}
