"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icon";
import {
  BUTTON_ICON_SIZES,
  BUTTON_ICON_TONES,
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from "./button-styles";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Leading icon, by vocabulary name (components/ui/icon.tsx). */
  icon?: IconName;
  /** Trailing icon, for "go forward" actions. */
  trailingIcon?: IconName;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      icon,
      trailingIcon,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const iconClass = cn(BUTTON_ICON_SIZES[size], BUTTON_ICON_TONES[variant]);
    return (
      <button
        ref={ref}
        className={buttonClasses({ variant, size, className })}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <svg
            aria-hidden="true"
            className={cn(BUTTON_ICON_SIZES[size], "animate-spin")}
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          icon && <Icon name={icon} className={iconClass} />
        )}
        {children}
        {trailingIcon && <Icon name={trailingIcon} className={iconClass} />}
      </button>
    );
  }
);

Button.displayName = "Button";
