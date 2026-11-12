import { createHash } from "node:crypto";

/**
 * SHA-256 of a proposal's canonical terms text (src/lib/proposals/terms.ts).
 * The public page binds this into its approve action; the action recomputes
 * it from the current row and refuses a mismatch, so a client can only
 * approve the terms that were actually on their screen.
 *
 * Server-side only (node:crypto) — never import from a client component.
 */
export function termsFingerprint(canonicalTerms: string): string {
  return createHash("sha256").update(canonicalTerms, "utf8").digest("hex");
}
