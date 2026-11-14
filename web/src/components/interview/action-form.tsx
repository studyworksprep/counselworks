"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Action = (form: FormData) => Promise<{ error?: string; success?: boolean }>;
export function Hidden({ name, value }: { name: string; value: string | number }) {
  return <input type="hidden" name={name} value={value} />;
}
export function ActionForm({ action, children, label, onSaved, onDirty, className = "" }: {
  action: Action; children: ReactNode; label: string; onSaved?: () => void;
  onDirty?: (dirty: boolean) => void; className?: string;
}) {
  const [pending, start] = useTransition(), [error, setError] = useState(""), [dirty, setDirty] = useState(false), [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  return <form className={`space-y-4 ${className}`} onChange={() => { setDirty(true); setSaved(false); onDirty?.(true); }} onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setError("");
    start(async () => {
      try {
        const result = await action(form);
        if (result.error) setError(result.error);
        else { setDirty(false); setSaved(true); onDirty?.(false); onSaved?.(); }
      } catch { setError("Unable to save. Your text is still here. Please try again."); }
    });
  }}>
    <fieldset disabled={pending} className="min-w-0 space-y-4">{children}</fieldset>
    {error && <p role="alert" className="text-sm text-danger-700">{error}</p>}
    <div className="flex flex-wrap items-center gap-3"><Button type="submit" size="sm" loading={pending}>{label}</Button>
      <span role="status" className="text-xs text-gray-500">{dirty ? "Unsaved changes" : saved ? "Saved" : ""}</span></div>
  </form>;
}
