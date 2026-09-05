/**
 * Secure signing-link helpers (fix plan 12.7), pure and unit-tested in
 * tests/unit/agreements.test.ts. The token pattern mirrors the per-counselor
 * calendar-feed token (48 hex chars from 24 random bytes).
 */

export const SIGNING_TOKEN_PATTERN = /^[a-f0-9]{48}$/;

export function isValidSigningToken(token: unknown): token is string {
  return typeof token === "string" && SIGNING_TOKEN_PATTERN.test(token);
}

/** Path of the public signing page for a token. */
export function signingLinkPath(token: string): string {
  return `/sign/${token}`;
}

export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "https://www.counselworks.io"
  );
}

/** Absolute signing-link URL for emails and the staff "copy link" control. */
export function signingLinkUrl(token: string): string {
  return `${appBaseUrl()}${signingLinkPath(token)}`;
}
