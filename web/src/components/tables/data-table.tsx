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

/**
 * Server-driven pagination + sort (fix plan 11.1). When present, DataTable
 * renders `data` as the current page verbatim — it does NOT sort or slice
 * locally — and reports page/sort intent through the callbacks so the parent
 * can push them into URL params and refetch. Only columns with a `sortValue`
 * are treated as sortable; the value fn itself is unused in server mode.
 */
export interface ServerPagination {
  page: number;
  pageSize: number;
  total: number;
  sort: { key: string; dir: "asc" | "desc" } | null;
  onPageChange: (page: number) => void;
  onSortChange: (key: string, dir: "asc" | "desc") => void;
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
  /** Opt into server-driven paging/sort (fix plan 11.1). */
  server?: ServerPagination;
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
  server,
}: DataTableProps<T>) {
  const [localSort, setLocalSort] = useState<
    { key: string; dir: "asc" | "desc" } | null
  >(initialSort ?? null);
  const [localPage, setLocalPage] = useState(0);

  // In server mode the parent owns sort/page; locally we sort/slice.
  const sort = server ? server.sort : localSort;

  const sorted = useMemo(() => {
    if (server || !localSort) return data;
    const col = columns.find((c) => c.key === localSort.key);
    if (!col?.sortValue) return data;
    const sortValue = col.sortValue;
    const factor = localSort.dir === "asc" ? 1 : -1;
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
  }, [data, localSort, columns, server]);

  // Server mode: page/count come from the parent; render data verbatim.
  const paginate = server
    ? server.total > server.pageSize
    : pageSize > 0 && sorted.length > pageSize;
  const effectivePageSize = server ? server.pageSize : pageSize;
  const pageCount = paginate
    ? Math.ceil((server ? server.total : sorted.length) / effectivePageSize)
    : 1;
  const currentPage = server
    ? server.page - 1
    : Math.min(localPage, pageCount - 1);
  const rows = server
    ? data
    : paginate
      ? sorted.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
      : sorted;

  function goToPage(zeroBased: number) {
    const clamped = Math.max(0, Math.min(pageCount - 1, zeroBased));
    if (server) server.onPageChange(clamped + 1);
    else setLocalPage(clamped);
  }

  function toggleSort(key: string) {
    const nextDir: "asc" | "desc" =
      sort?.key === key && sort.dir === "asc" ? "desc" : "asc";
    if (server) {
      server.onSortChange(key, nextDir);
    } else {
      setLocalPage(0);
      setLocalSort({ key, dir: nextDir });
    }
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
            {currentPage * effectivePageSize + 1}–
            {Math.min(
              (currentPage + 1) * effectivePageSize,
              server ? server.total : sorted.length
            )}{" "}
            of {server ? server.total : sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(currentPage - 1)}
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
              onClick={() => goToPage(currentPage + 1)}
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
