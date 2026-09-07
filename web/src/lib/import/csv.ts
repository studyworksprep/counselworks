/**
 * CSV bulk import of families/students (fix plan 13.4) — the pure half:
 * RFC-4180-style parsing, header aliasing, and per-row validation. The
 * database-aware planning and the writes live in src/lib/actions/import.ts.
 * Locked by tests/unit/import.test.ts.
 */

export const IMPORT_MAX_ROWS = 500;
export const IMPORT_MAX_BYTES = 1_000_000;

/** Canonical columns, in template order. */
export const IMPORT_COLUMNS = [
  "household_name",
  "student_first_name",
  "student_last_name",
  "graduation_year",
  "school_name",
  "city",
  "state_region",
  "postal_code",
  "address_line1",
  "parent_first_name",
  "parent_last_name",
  "parent_email",
  "parent_relationship",
  "counselor_email",
] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

const REQUIRED: ImportColumn[] = [
  "household_name",
  "student_first_name",
  "student_last_name",
  "graduation_year",
];

/** Spreadsheet-friendly header spellings → canonical column. */
const HEADER_ALIASES: Record<string, ImportColumn> = {
  household: "household_name",
  household_name: "household_name",
  family: "household_name",
  family_name: "household_name",
  first_name: "student_first_name",
  student_first_name: "student_first_name",
  student_first: "student_first_name",
  last_name: "student_last_name",
  student_last_name: "student_last_name",
  student_last: "student_last_name",
  graduation_year: "graduation_year",
  grad_year: "graduation_year",
  class_of: "graduation_year",
  year: "graduation_year",
  school: "school_name",
  school_name: "school_name",
  high_school: "school_name",
  city: "city",
  state: "state_region",
  state_region: "state_region",
  zip: "postal_code",
  zip_code: "postal_code",
  postal_code: "postal_code",
  address: "address_line1",
  address_line1: "address_line1",
  parent_first_name: "parent_first_name",
  parent_first: "parent_first_name",
  parent_last_name: "parent_last_name",
  parent_last: "parent_last_name",
  parent_email: "parent_email",
  email: "parent_email",
  parent_relationship: "parent_relationship",
  relationship: "parent_relationship",
  counselor_email: "counselor_email",
  counselor: "counselor_email",
  assigned_counselor: "counselor_email",
};

export const RELATIONSHIP_VALUES = ["parent", "guardian", "sibling", "other"] as const;

export interface ImportRow {
  /** 1-based line in the file (header is line 1). */
  line: number;
  household_name: string;
  student_first_name: string;
  student_last_name: string;
  graduation_year: number;
  school_name: string | null;
  city: string | null;
  state_region: string | null;
  postal_code: string | null;
  address_line1: string | null;
  parent_first_name: string | null;
  parent_last_name: string | null;
  parent_email: string | null;
  parent_relationship: (typeof RELATIONSHIP_VALUES)[number] | null;
  counselor_email: string | null;
  errors: string[];
}

/** Minimal RFC-4180 parser: quoted fields, doubled quotes, CRLF/LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully blank lines.
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

export function normalizeHeader(raw: string): ImportColumn | null {
  const key = raw
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-./]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  return HEADER_ALIASES[key] ?? null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  return v === "" ? null : v;
}

/**
 * Parse + validate a CSV into typed rows. `headerErrors` is non-empty when
 * the file is unusable as a whole (missing required columns); otherwise
 * each row carries its own `errors`.
 */
export function parseImportFile(text: string): {
  rows: ImportRow[];
  headerErrors: string[];
  unknownHeaders: string[];
} {
  const table = parseCsv(text);
  if (table.length === 0) {
    return { rows: [], headerErrors: ["The file is empty"], unknownHeaders: [] };
  }
  const headerRow = table[0];
  const columns: (ImportColumn | null)[] = headerRow.map(normalizeHeader);
  const unknownHeaders = headerRow.filter((h, i) => columns[i] === null && h.trim() !== "");
  const present = new Set(columns.filter((c): c is ImportColumn => c !== null));
  const headerErrors = REQUIRED.filter((c) => !present.has(c)).map(
    (c) => `Missing required column "${c}"`
  );
  if (headerErrors.length > 0) return { rows: [], headerErrors, unknownHeaders };

  const rows: ImportRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const values = table[i];
    const get = (col: ImportColumn) => {
      const idx = columns.indexOf(col);
      return idx === -1 ? undefined : values[idx];
    };
    const errors: string[] = [];
    const household = clean(get("household_name"));
    const first = clean(get("student_first_name"));
    const last = clean(get("student_last_name"));
    const yearRaw = clean(get("graduation_year"));
    const year = yearRaw ? Number(yearRaw) : NaN;
    if (!household) errors.push("Household name is required");
    if (!first) errors.push("Student first name is required");
    if (!last) errors.push("Student last name is required");
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      errors.push("Graduation year must be a 4-digit year");
    }
    const parentEmail = clean(get("parent_email"))?.toLowerCase() ?? null;
    const parentFirst = clean(get("parent_first_name"));
    const parentLast = clean(get("parent_last_name"));
    if (parentEmail && !EMAIL_RE.test(parentEmail)) errors.push("Parent email is not valid");
    if (parentEmail && (!parentFirst || !parentLast)) {
      errors.push("Parent first and last name are required with a parent email");
    }
    if (!parentEmail && (parentFirst || parentLast)) {
      errors.push("Parent email is required to add a parent");
    }
    const relRaw = clean(get("parent_relationship"))?.toLowerCase() ?? null;
    let relationship: ImportRow["parent_relationship"] = null;
    if (parentEmail) {
      if (relRaw && !(RELATIONSHIP_VALUES as readonly string[]).includes(relRaw)) {
        errors.push(`Relationship must be one of ${RELATIONSHIP_VALUES.join(", ")}`);
      } else {
        relationship = (relRaw as ImportRow["parent_relationship"]) ?? "parent";
      }
    }
    const counselorEmail = clean(get("counselor_email"))?.toLowerCase() ?? null;
    if (counselorEmail && !EMAIL_RE.test(counselorEmail)) {
      errors.push("Counselor email is not valid");
    }

    rows.push({
      line: i + 1,
      household_name: household ?? "",
      student_first_name: first ?? "",
      student_last_name: last ?? "",
      graduation_year: Number.isInteger(year) ? year : 0,
      school_name: clean(get("school_name")),
      city: clean(get("city")),
      state_region: clean(get("state_region")),
      postal_code: clean(get("postal_code")),
      address_line1: clean(get("address_line1")),
      parent_first_name: parentFirst,
      parent_last_name: parentLast,
      parent_email: parentEmail,
      parent_relationship: relationship,
      counselor_email: counselorEmail,
      errors,
    });
  }
  if (rows.length > IMPORT_MAX_ROWS) {
    return {
      rows: [],
      headerErrors: [`Import at most ${IMPORT_MAX_ROWS} rows at a time (found ${rows.length})`],
      unknownHeaders,
    };
  }
  return { rows, headerErrors: [], unknownHeaders };
}

/** Case/whitespace-insensitive key for matching names. */
export function nameKey(...parts: (string | number | null | undefined)[]): string {
  return parts
    .map((p) => String(p ?? "").trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

/** The downloadable template: header row plus one example line. */
export function importTemplateCsv(): string {
  return [
    IMPORT_COLUMNS.join(","),
    [
      "Rivera Household",
      "Maya",
      "Rivera",
      String(new Date().getFullYear() + 2),
      "Lincoln High School",
      "Austin",
      "TX",
      "78701",
      "12 Oak St",
      "Ana",
      "Rivera",
      "ana@example.com",
      "parent",
      "",
    ].join(","),
  ].join("\n");
}
