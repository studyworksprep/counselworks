"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

interface ToastItem {
  id: number;
  message: string;
  variant: "success" | "error";
}

type ToastFn = (message: string, variant?: "success" | "error") => void;

const ToastContext = createContext<ToastFn | null>(null);

/** Transient mutation feedback (fix plan 9.3). */
export function useToast(): ToastFn {
  const fn = useContext(ToastContext);
  if (!fn) throw new Error("useToast must be used inside <ToastProvider>");
  return fn;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const toast = useCallback<ToastFn>((message, variant = "success") => {
    const id = ++counter.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[120] flex flex-col gap-2"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-lg",
              t.variant === "success" ? "bg-gray-900" : "bg-danger-600"
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
