import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Workspace tabs (design refresh, phase 2): sibling views as real links
 * with the current one marked, plus optional secondary links on the right.
 * Replaces rows of underlined links at the top of workspace pages. Tabs wrap
 * rather than scroll, so narrow screens never overflow.
 */
export function WorkspaceTabs({
  label,
  tabs,
  current,
  extra,
  className,
}: {
  label: string;
  tabs: { key: string; label: string; href: string }[];
  current: string;
  extra?: React.ReactNode;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-gray-200",
        className
      )}
    >
      <ul className="-mb-px flex flex-wrap gap-x-1">
        {tabs.map((tab) => {
          const active = tab.key === current;
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "border-primary-600 font-semibold text-primary-700"
                    : "border-transparent font-medium text-gray-600 hover:border-gray-300 hover:text-gray-900"
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {extra && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pb-2.5">{extra}</div>
      )}
    </nav>
  );
}
