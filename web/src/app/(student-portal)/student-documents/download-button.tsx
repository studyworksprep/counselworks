"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { getDocumentDownloadUrl } from "@/lib/actions/documents";

export function DownloadButton({ documentId }: { documentId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDownload() {
    startTransition(async () => {
      const result = await getDocumentDownloadUrl(documentId);
      setError("error" in result ? result.error ?? null : null);
      if ("url" in result && result.url) {
        window.open(result.url, "_blank");
      }
    });
  }

  return (
    <div>
    <Button variant="outline" size="sm" onClick={handleDownload} loading={isPending}>
      Download
    </Button>
    {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
    </div>
  );
}
