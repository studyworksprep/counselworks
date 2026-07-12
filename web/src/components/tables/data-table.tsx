"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
  /** Right-align numeric columns (fix plan 8.5). */
  align?: "left" | "right";
  /**
   * Enables the header sort toggle. Returns the comparable value for the
   * row; strings compare case-insensitively, null/undefined sort last.
   */
  sortValue?: (item: T) => string | number | null | undefined;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  /** Rows per page (fix plan 8.5). Pass 0 to disable pagination. */
  pageSize?: number;
  /** Column key to sort by initially (must have a sortValue). */
  initialSort?: { key: string; dir: "asc" | "desc" };
}

function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined
): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  emptyMessage = "No data found.",
  pageSize = 25,
  initialSort,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    initialSort ?? null
  );
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return data;
    const sortValue = col.sortValue;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      const av = sortValue(a);
      const bv = sortValue(b);
      // Empty values sort last regardless of direction.
      const aNull = av === null || av === undefined || av === "";
      const bNull = bv === null || bv === undefined || bv === "";
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      return compareValues(av, bv) * factor;
    });
  }, [data, sort, columns]);

  const paginate = pageSize > 0 && sorted.length > pageSize;
  const pageCount = paginate ? Math.ceil(sorted.length / pageSize) : 1;
  const currentPage = Math.min(page, pageCount - 1);
  const rows = paginate
    ? sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
    : sorted;

  function toggleSort(key: string) {
    setPage(0);
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  }

  if (data.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-3 font-medium text-gray-500",
                  col.align === "right" && "text-right",
                  col.className
                )}
                aria-sort={
                  sort?.key === col.key
                    ? sort.dir === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                {col.sortValue ? (
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={cn(
                      "inline-flex items-center gap-1 hover:text-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500",
                      col.align === "right" && "flex-row-reverse"
                    )}
                  >
                    {col.header}
                    <span
                      className={cn(
                        "text-[10px]",
                        sort?.key === col.key
                          ? "text-gray-800"
                          : "text-gray-300"
                      )}
                      aria-hidden="true"
                    >
                      {sort?.key === col.key
                        ? sort.dir === "asc"
                          ? "▲"
                          : "▼"
                        : "▲▼"}
                    </span>
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr
              key={keyExtractor(item)}
              onClick={() => onRowClick?.(item)}
              className={cn(
                "border-b border-gray-100 transition-colors",
                onRowClick && "cursor-pointer hover:bg-gray-50"
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-4 py-3",
                    col.align === "right" && "text-right tabular-nums",
                    col.className
                  )}
                >
                  {col.render
                    ? col.render(item)
                    : String((item as Record<string, unknown>)[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {paginate && (
        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm text-gray-500">
          <span>
            {currentPage * pageSize + 1}–
            {Math.min((currentPage + 1) * pageSize, sorted.length)} of{" "}
            {sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="rounded-md border border-gray-200 px-3 py-1.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span className="tabular-nums">
              {currentPage + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={currentPage >= pageCount - 1}
              className="rounded-md border border-gray-200 px-3 py-1.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
