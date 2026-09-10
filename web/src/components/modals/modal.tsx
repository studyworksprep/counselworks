"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  trapFocus?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeStyles = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  trapFocus = false,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !trapFocus) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();
    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,summary,[tabindex="0"]'))
        .filter(el => !el.matches(':disabled') && el.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
    };
    dialog?.addEventListener("keydown", handleTab);
    return () => { dialog?.removeEventListener("keydown", handleTab); previous?.focus(); };
  }, [open, trapFocus]);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  // The overlay scrolls (overflow-y-auto + min-h-full wrapper) so a form
  // taller than the viewport can still reach its submit button — a fixed
  // flex-centered overlay clips tall modals at both ends with no way to
  // scroll (found by golden-path step 4: the Schedule Meeting button sat
  // permanently outside the viewport at 1280×720).
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50">
      <div
        ref={overlayRef}
        className="flex min-h-full items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === overlayRef.current) onClose();
        }}
      >
        <div
          ref={dialogRef}
          role={trapFocus ? "dialog" : undefined}
          aria-modal={trapFocus ? true : undefined}
          aria-labelledby={trapFocus ? titleId : undefined}
          tabIndex={trapFocus ? -1 : undefined}
          className={cn(
            "w-full rounded-xl bg-white shadow-xl",
            sizeStyles[size]
          )}
        >
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 id={titleId} className="text-lg font-semibold text-gray-900">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-gray-500">{description}</p>
            )}
          </div>
          <div className="px-6 py-4">{children}</div>
          {footer && (
            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
