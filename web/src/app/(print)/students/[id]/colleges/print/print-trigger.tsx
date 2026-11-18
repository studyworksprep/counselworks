"use client";

import { useEffect } from "react";

/**
 * Auto-opens the browser's print dialog shortly after the page loads.
 * The user can then "Save as PDF" or cancel and use the on-page button.
 */
export function PrintTrigger() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auto") === "0") return;
    // Wait a tick so layout settles (fonts, images) before invoking print.
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 print:hidden"
    >
      Print / Save as PDF
    </button>
  );
}
