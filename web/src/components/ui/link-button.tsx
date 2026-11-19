import Link from "next/link";
import type { ComponentProps } from "react";
import { Icon, type IconName } from "./icon";
import {
  BUTTON_ICON_SIZES,
  BUTTON_ICON_TONES,
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from "./button-styles";
import { cn } from "@/lib/utils";

/**
 * A navigation link that looks like a Button (design refresh, phase 1).
 * Server-safe: actions that go somewhere stay links, so they keep working
 * without client JavaScript and read correctly to assistive technology.
 * `icon` names the destination or verb (components/ui/icon.tsx).
 */
export function LinkButton({
  variant = "primary",
  size = "md",
  icon,
  trailingIcon,
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  trailingIcon?: IconName;
}) {
  const iconClass = cn(BUTTON_ICON_SIZES[size], BUTTON_ICON_TONES[variant]);
  return (
    <Link {...props} className={buttonClasses({ variant, size, className })}>
      {icon && <Icon name={icon} className={iconClass} />}
      {children}
      {trailingIcon && <Icon name={trailingIcon} className={iconClass} />}
    </Link>
  );
}
