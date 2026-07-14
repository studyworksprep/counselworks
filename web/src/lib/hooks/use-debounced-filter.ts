"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Debounced URL-param filtering (fix plan 8.5): list searches used to fire a
 * router.push per keystroke, re-running the server query for every letter.
 * Text updates debounce 300ms; discrete filters (selects) apply immediately
 * via `setParam`.
 */
export function useDebouncedFilter(basePath: string) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function push(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`${basePath}?${params.toString()}`);
  }

  /**
   * Immediate update — selects, toggles. Changing a filter resets the page
   * back to 1 (fix plan 11.1) so server pagination never lands past the end.
   */
  function setParam(key: string, value: string) {
    if (timer.current) clearTimeout(timer.current);
    push({ [key]: value, page: "" });
  }

  /** Debounced update — free-text search inputs. Also resets the page. */
  function setSearchParamDebounced(key: string, value: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push({ [key]: value, page: "" }), 300);
  }

  /**
   * Multi-key update with no implicit page reset — pagination (`{ page }`)
   * and sort (`{ sort, dir, page: "" }`) drive this directly.
   */
  function setParams(updates: Record<string, string>) {
    if (timer.current) clearTimeout(timer.current);
    push(updates);
  }

  return { searchParams, setParam, setSearchParamDebounced, setParams };
}
