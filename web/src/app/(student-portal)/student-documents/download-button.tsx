"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { getDocumentDownloadUrl } from "@/lib/actions/documents";

export function DownloadButton({ documentId }: { documentId: string }) {
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
    <Button variant="outline" size="sm" onClick={handleDownload} loading={isPending}>
      Download
    </Button>
  );
}
