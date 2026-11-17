import { Button } from "./button";
import { LinkButton } from "./link-button";

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  /** Client callers: run an action. */
  onAction?: () => void;
  /**
   * Server callers: link to where the next step happens. Server components
   * cannot pass onAction, which is why empty portal pages used to fall back
   * to a single grey sentence.
   */
  actionHref?: string;
  icon?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  icon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && (
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-gray-600">{description}</p>
      {actionLabel && actionHref && (
        <LinkButton href={actionHref} variant="outline" className="mt-4">
          {actionLabel}
        </LinkButton>
      )}
      {actionLabel && !actionHref && onAction && (
        <Button className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
