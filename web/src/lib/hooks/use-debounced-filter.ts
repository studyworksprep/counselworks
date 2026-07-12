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

  function push(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${basePath}?${params.toString()}`);
  }

  /** Immediate update — selects, toggles. */
  function setParam(key: string, value: string) {
    if (timer.current) clearTimeout(timer.current);
    push(key, value);
  }

  /** Debounced update — free-text search inputs. */
  function setSearchParamDebounced(key: string, value: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => push(key, value), 300);
  }

  return { searchParams, setParam, setSearchParamDebounced };
}
