import { cn } from "@/lib/utils";
import { StatusIcon } from "@/components/ui/status-chip";

/**
 * Sign-off pair (design refresh, phase 2): who has approved and who is
 * still pending, side by side. For packet approvals and agreement signatures.
 */
export function SignOffPair({
  items,
  className,
}: {
  items: { label: string; done: boolean; detail: string }[];
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "flex items-center gap-3 rounded-xl px-4 py-3 ring-1 ring-inset",
            item.done ? "bg-success-50 ring-success-200" : "bg-white ring-gray-300"
          )}
        >
          {item.done ? (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success-700 text-white">
              <StatusIcon name="check" className="h-4 w-4" />
            </span>
          ) : (
            <span className="box-border flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-gray-400 text-gray-600">
              <StatusIcon name="clock" className="h-3.5 w-3.5" />
            </span>
          )}
          <div className="min-w-0">
            <dt className={cn("text-xs font-semibold", item.done ? "text-success-800" : "text-gray-600")}>
              {item.label}
            </dt>
            <dd className="text-sm text-gray-900">{item.detail}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
