import { cn } from "@/lib/utils";

/**
 * Product mark (fix plan 9.1): cap glyph + wordmark, used by the shells and
 * the auth frame. White-label shells swap this for the firm's logo when one
 * is configured (fix plan 9.2).
 */
export function Wordmark({
  className,
  dark = false,
}: {
  className?: string;
  dark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 32 32"
        className="h-7 w-7 shrink-0"
        aria-hidden="true"
      >
        <rect width="32" height="32" rx="7" fill="#4f46e5" />
        <path d="M16 8 L27 13 L16 18 L5 13 Z" fill="#ffffff" />
        <path
          d="M10 15.8 V20 C10 22 13 23.5 16 23.5 C19 23.5 22 22 22 20 V15.8 L16 18.5 Z"
          fill="#c7d2fe"
        />
        <path
          d="M26 13.5 V19"
          stroke="#ffffff"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <span
        className={cn(
          "text-lg font-bold tracking-tight",
          dark ? "text-white" : "text-gray-900"
        )}
      >
        CounselWorks
      </span>
    </span>
  );
}
