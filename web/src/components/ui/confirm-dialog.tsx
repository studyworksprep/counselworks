"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Button } from "./button";

interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * App-styled confirmation dialog (fix plan 9.3) — replaces every native
 * `confirm()` / `alert()`. Usage:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Delete this?", destructive: true }))) return;
 */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) {
    throw new Error("useConfirm must be used inside <ConfirmDialogProvider>");
  }
  return fn;
}

export function ConfirmDialogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function settle(value: boolean) {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-label={options.title}
          onClick={() => settle(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-gray-900">
              {options.title}
            </h2>
            {options.body && (
              <p className="mt-2 text-sm text-gray-500">{options.body}</p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="outline" onClick={() => settle(false)}>
                {options.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                onClick={() => settle(true)}
                className={
                  options.destructive
                    ? "bg-danger-600 hover:bg-danger-700 focus-visible:ring-danger-500"
                    : undefined
                }
              >
                {options.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
