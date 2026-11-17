/**
 * Document categories (documents.category and document_requests.category).
 * One definition for the staff upload and filter controls, document
 * requests, portal uploads, and every label in the portals.
 */
export const DOCUMENT_CATEGORIES = [
  { value: "transcript", label: "Transcript" },
  { value: "recommendation", label: "Recommendation" },
  { value: "essay", label: "Essay" },
  { value: "test_score", label: "Test score" },
  { value: "financial", label: "Financial" },
  { value: "other", label: "Other" },
] as const;

/**
 * Written only by the system: signed agreement PDFs (agreements/sign.ts)
 * and invoices (billing/generate.ts). Labeled everywhere, never offered
 * as an upload choice.
 */
export const SYSTEM_DOCUMENT_CATEGORIES = [
  { value: "agreement", label: "Agreement" },
  { value: "invoice", label: "Invoice" },
] as const;

/** Categories a person may choose when uploading or requesting a document. */
export const DOCUMENT_CATEGORY_VALUES = new Set<string>(
  DOCUMENT_CATEGORIES.map((c) => c.value)
);

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  [...DOCUMENT_CATEGORIES, ...SYSTEM_DOCUMENT_CATEGORIES].map((c) => [c.value, c.label])
);

/**
 * Students and families upload their own records; recommendation letters
 * come from recommenders through staff, so portals don't offer that category.
 */
export const PORTAL_UPLOAD_CATEGORIES = DOCUMENT_CATEGORIES.filter(
  (c) => c.value !== "recommendation"
);
