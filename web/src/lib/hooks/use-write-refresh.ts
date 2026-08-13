"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Repaint the page after a server-action write, independently of the action's
 * own response stream.
 *
 * Why this exists (PR #17): a server action that calls revalidatePath streams
 * its revalidated page tree back in the action response, but the client
 * runtime intermittently discards that payload after consuming the action's
 * return value — socket-level diagnostics in CI showed the server flushing
 * every response completely (`finished=true`) while the page still failed to
 * repaint. Any post-await update inside the same transition (the historical
 * `onClose(); router.refresh()` shape) is also unreliable: React 19 loses the
 * async transition context after `await`, and a refresh issued there can be
 * torn down with the action stream.
 *
 * The reliable sequence is: resolve the action promise (its return value
 * rides in an early chunk and always arrives), flip a plain state tick, and
 * do the follow-up work in an effect — outside any transition — where
 * `router.refresh()` runs as an independent fetch.
 *
 * Usage:
 *   const commitWrite = useWriteRefresh();
 *   startTransition(async () => {
 *     const result = await someAction(formData);
 *     if (result.error) { setError(result.error); return; }
 *     commitWrite(onClose); // optional callback runs before the refresh
 *   });
 *
 * The callback is held in a ref, so callers don't need identity-stable
 * closures and a parent re-render can never replay it.
 */
export function useWriteRefresh() {
  const router = useRouter();
  const [tick, setTick] = useState(0);
  const afterRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    if (tick === 0) return;
    const after = afterRef.current;
    afterRef.current = undefined;
    after?.();
    router.refresh();
  }, [tick, router]);

  return (after?: () => void) => {
    afterRef.current = after;
    setTick((t) => t + 1);
  };
}
