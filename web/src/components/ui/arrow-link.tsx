import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * A "go somewhere" link with a direction arrow (design refresh, phase 1).
 * Replaces stand-alone underlined links: medium weight, brand color, and an
 * underline only on hover. Links inside a sentence stay plain underlined text.
 */
export function ArrowLink({
  back = false,
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { back?: boolean }) {
  const arrow = (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0"
    >
      {back ? (
        <>
          <path d="M13 8H3" />
          <path d="M7 4L3 8l4 4" />
        </>
      ) : (
        <>
          <path d="M3 8h10" />
          <path d="M9 4l4 4-4 4" />
        </>
      )}
    </svg>
  );
  return (
    <Link
      {...props}
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 underline-offset-2 hover:text-primary-800 hover:underline",
        className
      )}
    >
      {back && arrow}
      {children}
      {!back && arrow}
    </Link>
  );
}
