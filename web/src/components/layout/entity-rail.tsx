"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { persistCollapsed } from "@/lib/ui/layout-prefs";

export interface RailItem {
  id: string;
  label: string;
  /** Small trailing hint (e.g. a non-active status) — omitted when null. */
  hint?: string | null;
}

export interface RailGroup {
  key: string;
  label: string;
  items: RailItem[];
}

/**
 * Grouped, searchable, collapsible rail shared by the student and family
 * workspaces (fix plan 13.0). Plain <details> groups — the group holding
 * the current record opens by default — so it stays keyboard accessible
 * with no extra state.
 *
 * Collapsed, it renders no names at all (not merely hidden): a counselor
 * sharing their screen can hide the rest of the roster with one click, and
 * the choice is remembered per browser via a cookie so the next page paints
 * collapsed too. Hidden below lg, where the workspace header's switcher
 * takes over.
 */
export function EntityRail({
  label,
  groups,
  currentId,
  hrefFor,
  rosterHref,
  createHref,
  createLabel,
  searchPlaceholder,
  emptyText,
  cookieName,
  initialCollapsed,
  icon,
}: {
  /** Accessible name and heading, e.g. "Students". */
  label: string;
  groups: RailGroup[];
  currentId: string | null;
  hrefFor: (id: string) => string;
  rosterHref: string;
  /** Present only when the caller may create (owner/admin intake gate). */
  createHref?: string;
  createLabel?: string;
  searchPlaceholder: string;
  /** Shown when there is nothing to list at all (before searching). */
  emptyText: string;
  cookieName: string;
  initialCollapsed: boolean;
  /** Icon for the collapsed strip's "show" button. */
  icon: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [query, setQuery] = useState("");

  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);
  const searching = query.trim() !== "";

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    persistCollapsed(cookieName, next);
  }

  if (collapsed) {
    return (
      <aside
        aria-label={label}
        className="hidden w-10 shrink-0 border-r border-gray-200 bg-slate-100 lg:block"
      >
        <div className="sticky top-0 flex flex-col items-center gap-2 py-3">
          <button
            type="button"
            onClick={toggle}
            aria-label={`Show ${label.toLowerCase()}`}
            aria-expanded={false}
            title={`Show ${label.toLowerCase()}`}
            className="rounded-md p-1.5 text-gray-500 hover:bg-slate-200 hover:text-gray-700"
          >
            {icon}
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label={label}
      className="hidden w-60 shrink-0 border-r border-gray-200 bg-slate-50 lg:block"
    >
      <div className="sticky top-0 flex max-h-screen flex-col">
        <div className="flex items-center justify-between px-3 pt-3">
          <span className="px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            {label}
          </span>
          <div className="flex items-center gap-1">
            <Link
              href={rosterHref}
              className="rounded-md px-1.5 py-1 text-xs text-primary-600 hover:bg-slate-200 hover:text-primary-700"
            >
              Roster
            </Link>
            <button
              type="button"
              onClick={toggle}
              aria-label={`Hide ${label.toLowerCase()}`}
              aria-expanded={true}
              title={`Hide ${label.toLowerCase()} (e.g. while sharing your screen)`}
              className="rounded-md p-1 text-gray-500 hover:bg-slate-200 hover:text-gray-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
          </div>
        </div>
        <div className="space-y-2 px-3 py-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder.replace(/…$/, "")}
            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm placeholder:text-gray-400 focus:border-primary-400 focus:outline-none"
          />
          {createHref && createLabel && (
            <Link
              href={createHref}
              className="block rounded-md border border-dashed border-gray-300 bg-white px-2 py-1.5 text-center text-xs font-medium text-gray-600 hover:border-primary-400 hover:text-primary-700"
            >
              + {createLabel}
            </Link>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          {filtered.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-500">
              {total === 0 ? emptyText : "No matches."}
            </p>
          )}
          {filtered.map((group) => {
            const holdsCurrent = group.items.some((i) => i.id === currentId);
            return (
              <details
                key={group.key}
                open={holdsCurrent || searching || filtered.length === 1}
                className="group border-t border-gray-200"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between bg-slate-200/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-800 hover:bg-slate-200">
                  <span className="flex items-center gap-1.5">
                    <svg
                      className="h-3 w-3 text-gray-500 transition-transform group-open:rotate-90"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                    {group.label}
                  </span>
                  <span className="text-[10px] font-semibold text-gray-500">{group.items.length}</span>
                </summary>
                <ul className="py-1">
                  {group.items.map((item) => {
                    const active = item.id === currentId;
                    return (
                      <li key={item.id}>
                        <Link
                          href={hrefFor(item.id)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center justify-between py-1.5 pl-8 pr-3 text-sm",
                            active
                              ? "bg-primary-50 font-medium text-primary-700"
                              : "text-gray-700 hover:bg-slate-100"
                          )}
                        >
                          <span className="truncate">{item.label}</span>
                          {item.hint && (
                            <span className="ml-2 shrink-0 text-[10px] uppercase text-gray-400">
                              {item.hint}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
