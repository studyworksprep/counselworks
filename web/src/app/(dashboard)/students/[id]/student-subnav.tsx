"use client";

import { useEffect, useRef, useState, useId } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Student workspace sub-navigation (fix plan 13.0). Real routes, not tabs
 * in client state: deep links land on the right area, back/forward work,
 * and each area is its own server component.
 */
export const STUDENT_SECTIONS = [
  { key: "overview", label: "Overview", path: "" },
  { key: "profile", label: "Profile", path: "/profile" },
  { key: "colleges", label: "Colleges", path: "/colleges" },
  { key: "applications", label: "Applications", path: "/applications" },
  { key: "essays", label: "Essays", path: "/essays" },
  { key: "tasks", label: "Tasks", path: "/tasks" },
  { key: "documents", label: "Documents", path: "/documents" },
  { key: "meetings", label: "Meetings", path: "/meetings" },
  { key: "family", label: "Family & Billing", path: "/family" },
] as const;

export function StudentSubnav({ studentId }: { studentId: string }) {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const [overflow, setOverflow] = useState({ left: false, right: false });
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () => setOverflow({ left: list.scrollLeft > 1, right: list.scrollLeft + list.clientWidth < list.scrollWidth - 1 });
    const observer = new ResizeObserver(update);
    observer.observe(list);
    list.addEventListener("scroll", update);
    const active = list.querySelector<HTMLElement>('[aria-current="page"]');
    if (active) {
      const item = active.getBoundingClientRect();
      const bounds = list.getBoundingClientRect();
      if (item.left < bounds.left) list.scrollLeft += item.left - bounds.left;
      else if (item.right > bounds.right) list.scrollLeft += item.right - bounds.right;
    }
    return () => { observer.disconnect(); list.removeEventListener("scroll", update); };
  }, [pathname]);
  function scrollSections(direction: number) {
    const list = listRef.current;
    list?.scrollBy({ left: direction * list.clientWidth * 0.75 });
  }
  const base = `/students/${studentId}`;
  const current =
    [...STUDENT_SECTIONS]
      .filter((s) => s.path !== "")
      .find((s) => pathname.startsWith(`${base}${s.path}`))?.key ?? "overview";

  return (
    <nav
      aria-label="Student sections"
      className="border-b border-gray-200 bg-white px-4 sm:px-8"
    >
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Earlier student sections" aria-controls={listId}
          disabled={!overflow.left} onClick={() => scrollSections(-1)}
          className="shrink-0 rounded px-2 py-2 text-primary-700 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-primary-500">‹</button>
      <ul ref={listRef} id={listId} className="-mb-px flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {STUDENT_SECTIONS.map((s) => {
          const active = s.key === current;
          return (
            <li key={s.key}>
              <Link
                href={`${base}${s.path}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-block whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-primary-500",
                  active
                    ? "border-primary-600 text-primary-700"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                )}
              >
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
        <button type="button" aria-label="Later student sections" aria-controls={listId}
          disabled={!overflow.right} onClick={() => scrollSections(1)}
          className="shrink-0 rounded px-2 py-2 text-primary-700 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-primary-500">›</button>
      </div>
    </nav>
  );
}
