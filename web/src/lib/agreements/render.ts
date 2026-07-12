/**
 * Pure agreement-template helpers (fix plan 10.1), unit-tested in
 * tests/unit/agreements.test.ts.
 */

/** Substitute the supported placeholders into a template body. */
export function renderAgreementBody(
  template: string,
  vars: { family_name: string; firm_name: string; date: string }
): string {
  return template
    .replaceAll("{{family_name}}", vars.family_name)
    .replaceAll("{{firm_name}}", vars.firm_name)
    .replaceAll("{{date}}", vars.date);
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
