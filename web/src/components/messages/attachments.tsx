"use client";

import { useRef, useState } from "react";
import { getDocumentDownloadUrl } from "@/lib/actions/documents";
import { sendMessageWithAttachment } from "@/lib/actions/messages";

/**
 * Message attachments (fix plan 10.5): chips on bubbles + a paperclip
 * button for the composer. Downloads route through the visibility-checked
 * getDocumentDownloadUrl.
 */

export function AttachmentChips({
  attachments,
  mine,
}: {
  attachments?: { id: string; title: string }[];
  mine: boolean;
}) {
  if (!attachments || attachments.length === 0) return null;

  async function open(id: string) {
    const result = await getDocumentDownloadUrl(id);
    if (result.url) window.open(result.url, "_blank");
  }

  return (
    <div className="mt-1.5 space-y-1">
      {attachments.map((a) => (
        <button
          key={a.id}
          onClick={() => open(a.id)}
          className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium ${
            mine
              ? "bg-white/15 text-white hover:bg-white/25"
              : "bg-white text-primary-700 shadow-sm hover:bg-primary-50"
          }`}
        >
          <svg
            className="h-3.5 w-3.5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13"
            />
          </svg>
          <span className="truncate">{a.title}</span>
        </button>
      ))}
    </div>
  );
}

export function AttachFileButton({
  conversationId,
  caption,
  onSent,
  onError,
}: {
  conversationId: string | null;
  /** Current composer text — sent as the attachment's caption. */
  caption: string;
  onSent: () => void;
  onError?: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !conversationId) return;
    setBusy(true);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("body", caption);
    const result = await sendMessageWithAttachment(conversationId, formData);
    setBusy(false);
    if ("error" in result && result.error) {
      onError?.(result.error);
      return;
    }
    onSent();
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleFile}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy || !conversationId}
        aria-label="Attach a file"
        title="Attach a file"
        className="rounded-lg border border-gray-300 px-2.5 text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50"
      >
        {busy ? (
          <span className="text-xs">…</span>
        ) : (
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.8}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13"
            />
          </svg>
        )}
      </button>
    </>
  );
}
