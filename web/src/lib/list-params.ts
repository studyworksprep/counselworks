import type { ListSort } from "@/lib/db/queries";

/**
 * Parse server-pagination URL params (fix plan 11.1) for the roster list
 * pages: `?page=`, `?sort=<columnKey>`, `?dir=asc|desc`. An unrecognized
 * sort key is ignored so the query falls back to its default order.
 */
export function parseListParams(
  params: { page?: string; sort?: string; dir?: string },
  sortableKeys: readonly string[]
): { page: number; sort?: ListSort } {
  const parsedPage = params.page ? parseInt(params.page, 10) : 1;
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const key =
    params.sort && sortableKeys.includes(params.sort) ? params.sort : undefined;
  const dir: "asc" | "desc" = params.dir === "desc" ? "desc" : "asc";
  return { page, sort: key ? { key, dir } : undefined };
}
