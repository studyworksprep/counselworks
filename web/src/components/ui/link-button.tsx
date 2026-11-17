import Link from "next/link";
import type { ComponentProps } from "react";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button-styles";

/**
 * A navigation link that looks like a Button (design refresh, phase 1).
 * Server-safe: actions that go somewhere stay links, so they keep working
 * without client JavaScript and read correctly to assistive technology.
 */
export function LinkButton({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <Link {...props} className={buttonClasses({ variant, size, className })} />
  );
}
