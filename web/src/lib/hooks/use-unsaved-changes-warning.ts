"use client";

import { useEffect } from "react";

/**
 * Block tab close / hard navigation while there are unsaved changes
 * (fix plan 7.9 — both essay editors silently dropped work). Browsers show
 * their own generic prompt; the custom string is ignored but required by
 * the legacy API shape.
 */
export function useUnsavedChangesWarning(hasUnsaved: boolean): void {
  useEffect(() => {
    if (!hasUnsaved) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsaved]);
}
