import { cn } from "@/lib/utils";

const VARIANTS = {
  error: "bg-danger-50 text-danger-700",
  success: "bg-success-50 text-success-700",
  warning: "bg-warning-50 text-warning-800",
  info: "bg-primary-50 text-primary-700",
} as const;

/**
 * Inline feedback banner (fix plan 9.3) — replaces the hand-copied
 * red error <div> that existed in ~37 places.
 */
export function Alert({
  variant = "error",
  children,
  className,
}: {
  variant?: keyof typeof VARIANTS;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn("rounded-md p-3 text-sm", VARIANTS[variant], className)}
    >
      {children}
    </div>
  );
}
