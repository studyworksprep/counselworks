import { cn } from "@/lib/utils";

/**
 * Button classes without the component (no "use client"), so server
 * components can style a <Link> as a button via LinkButton.
 */
export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500",
  secondary:
    "bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:ring-gray-500",
  outline:
    "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus-visible:ring-primary-500",
  ghost: "text-gray-700 hover:bg-gray-100 focus-visible:ring-gray-500",
  // danger-600, not 500: white on danger-500 is 3.8:1, under the 4.5:1 floor.
  danger:
    "bg-danger-600 text-white hover:bg-danger-700 focus-visible:ring-danger-500",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}
