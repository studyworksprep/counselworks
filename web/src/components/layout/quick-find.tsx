"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { quickFind, type QuickFindResult } from "@/lib/actions/search";

/**
 * Global quick-find (fix plan 8.4). Trigger button lives in the staff
 * sidebar; Cmd/Ctrl-K opens it from anywhere; Enter jumps to the highlighted
 * record.
 */
export function QuickFind() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<QuickFindResult[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    // Reset + focus after the dialog paints (async to satisfy the
    // no-sync-setState-in-effect rule).
    const t = setTimeout(() => {
      setQuery("");
      setResults([]);
      setHighlighted(0);
      inputRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  const runSearch = useCallback((value: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      if (value.trim().length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      const res = await quickFind(value);
      setSearching(false);
      if ("results" in res) {
        setResults(res.results);
        setHighlighted(0);
      }
    }, 200);
  }, []);

  function select(result: QuickFindResult) {
    setOpen(false);
    router.push(result.href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && results[highlighted]) {
      e.preventDefault();
      select(results[highlighted]);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-3 mb-2 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg bg-sidebar-hover px-3 py-2 text-sm text-sidebar-text hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
        aria-label="Search students and families"
      >
        <SearchIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded bg-black/20 px-1.5 py-0.5 text-[10px]">⌘K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 pt-[15vh]"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Quick find"
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                runSearch(e.target.value);
              }}
              onKeyDown={onInputKey}
              placeholder="Jump to a student or family…"
              className="w-full rounded-t-xl border-b border-gray-100 px-4 py-3.5 text-sm focus:outline-none"
              aria-label="Search query"
            />
            <div className="max-h-80 overflow-y-auto p-2">
              {query.trim().length < 2 ? (
                <p className="px-3 py-6 text-center text-sm text-gray-400">
                  Type at least two characters.
                </p>
              ) : searching && results.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-gray-400">
                  Searching…
                </p>
              ) : results.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-gray-400">
                  No students or families match.
                </p>
              ) : (
                <ul>
                  {results.map((r, i) => (
                    <li key={`${r.kind}-${r.id}`}>
                      <button
                        type="button"
                        onClick={() => select(r)}
                        onMouseEnter={() => setHighlighted(i)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                          i === highlighted ? "bg-primary-50" : ""
                        }`}
                      >
                        <span
                          className={`inline-flex w-16 justify-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            r.kind === "student"
                              ? "bg-primary-100 text-primary-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {r.kind === "student" ? "Student" : "Family"}
                        </span>
                        <span className="flex-1 font-medium text-gray-900">
                          {r.label}
                        </span>
                        {r.sublabel && (
                          <span className="text-xs text-gray-400">
                            {r.sublabel}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
      />
    </svg>
  );
}
