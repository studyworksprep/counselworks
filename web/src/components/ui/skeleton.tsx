import { cn } from "@/lib/utils";

/** Loading placeholder block (fix plan 8.1); shared by all route skeletons. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-gray-200/70", className)}
      aria-hidden="true"
    />
  );
}

/**
 * Generic page-level skeleton: header bar + stat row + content card.
 * Used by every route group's loading.tsx so navigation always paints
 * immediately instead of freezing on data.
 */
export function PageSkeleton() {
  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-8 py-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <div className="p-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="mt-6 h-72" />
      </div>
    </div>
  );
}
