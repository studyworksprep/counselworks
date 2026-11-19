import type { IconName } from "./icon";
import { LinkButton } from "./link-button";
import { cn } from "@/lib/utils";

export interface QuickLink {
  href: string;
  label: string;
  /** The destination's area icon (components/ui/icon.tsx). */
  icon: IconName;
  prefetch?: boolean;
}

/**
 * Quick links (design refresh): a row of related destinations drawn as
 * small outlined buttons, each led by its destination's icon. Replaces rows
 * of bare underlined links ("Application readiness · Strategy brief · …")
 * so the jumps between workspaces read as navigation, not body text.
 * Server-safe; wraps on narrow screens.
 */
export function QuickLinks({
  label,
  links,
  className,
}: {
  label: string;
  links: QuickLink[];
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {links.map((link) => (
        <LinkButton
          key={link.href + link.label}
          href={link.href}
          prefetch={link.prefetch}
          size="sm"
          variant="outline"
          icon={link.icon}
        >
          {link.label}
        </LinkButton>
      ))}
    </nav>
  );
}
