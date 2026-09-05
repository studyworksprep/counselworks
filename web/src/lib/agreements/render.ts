/**
 * Pure agreement-template helpers (fix plan 10.1), unit-tested in
 * tests/unit/agreements.test.ts.
 */

/**
 * The placeholders a template may use — the single list the editor's help
 * text, save-time validation, and send-time substitution all read. Fee
 * placeholders resolve from the fee terms entered at send time, so a
 * template that uses them cannot be sent without fee terms (fails loudly
 * rather than leaving "{{total_fee}}" in a signed contract).
 */
export const AGREEMENT_PLACEHOLDERS = [
  { key: "family_name", description: "the household name", fee: false },
  { key: "firm_name", description: "your firm's name", fee: false },
  { key: "date", description: "the send date, e.g. September 5, 2026", fee: false },
  { key: "year", description: "the send year, e.g. 2026", fee: false },
  { key: "total_fee", description: "the total engagement fee, e.g. $5,400.00", fee: true },
  { key: "deposit_fee", description: "the retainer / deposit due at signing", fee: true },
  { key: "retainer", description: "same as deposit_fee", fee: true },
] as const;

export type AgreementPlaceholder = (typeof AGREEMENT_PLACEHOLDERS)[number]["key"];

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
const KNOWN = new Set<string>(AGREEMENT_PLACEHOLDERS.map((p) => p.key));
const FEE_KEYS = new Set<string>(
  AGREEMENT_PLACEHOLDERS.filter((p) => p.fee).map((p) => p.key)
);

/** Every distinct {{placeholder}} a template mentions, in order of appearance. */
export function templatePlaceholders(template: string): string[] {
  const seen = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER_PATTERN)) seen.add(m[1]);
  return Array.from(seen);
}

/** Placeholders the template uses that nothing can fill. */
export function unsupportedPlaceholders(template: string): string[] {
  return templatePlaceholders(template).filter((k) => !KNOWN.has(k));
}

/** True when the template needs fee terms to render completely. */
export function templateNeedsFeeTerms(template: string): boolean {
  return templatePlaceholders(template).some((k) => FEE_KEYS.has(k));
}

export interface AgreementVars {
  family_name: string;
  firm_name: string;
  date: string;
  year?: string;
  /** Pre-formatted money strings; absent when sent without fee terms. */
  total_fee?: string;
  deposit_fee?: string;
}

/**
 * Substitute the supported placeholders into a template body. Unknown or
 * unfillable placeholders are left verbatim — callers validate with
 * unsupportedPlaceholders / templateNeedsFeeTerms first so that never
 * reaches a signed document.
 */
export function renderAgreementBody(
  template: string,
  vars: AgreementVars
): string {
  const values: Record<string, string | undefined> = {
    family_name: vars.family_name,
    firm_name: vars.firm_name,
    date: vars.date,
    year: vars.year ?? vars.date.match(/\d{4}/)?.[0],
    total_fee: vars.total_fee,
    deposit_fee: vars.deposit_fee,
    retainer: vars.deposit_fee,
  };
  return template.replace(PLACEHOLDER_PATTERN, (whole, key: string) =>
    values[key] !== undefined ? (values[key] as string) : whole
  );
}

/** The signing-state machine: which status follows a signature event. */
export function nextAgreementStatus(
  current: string,
  signedRoles: ReadonlySet<string>
): "partially_signed" | "completed" {
  if (current === "completed" || current === "voided") {
    throw new Error(`Agreement is ${current}; no further signatures allowed`);
  }
  return signedRoles.has("firm") && signedRoles.has("family")
    ? "completed"
    : "partially_signed";
}
