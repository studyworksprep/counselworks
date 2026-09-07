import { describe, expect, it } from "vitest";
import {
  importTemplateCsv,
  nameKey,
  normalizeHeader,
  parseCsv,
  parseImportFile,
} from "@/lib/import/csv";

describe("parseCsv", () => {
  it("handles quotes, embedded commas, doubled quotes, CRLF, and a BOM", () => {
    const text = '﻿a,b\r\n"x, y","say ""hi"""\r\n\r\nplain,2\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["plain", "2"],
    ]);
  });
});

describe("normalizeHeader", () => {
  it("maps spreadsheet spellings onto canonical columns", () => {
    expect(normalizeHeader("Household")).toBe("household_name");
    expect(normalizeHeader("Student First Name")).toBe("student_first_name");
    expect(normalizeHeader("Class of")).toBe("graduation_year");
    expect(normalizeHeader("ZIP")).toBe("postal_code");
    expect(normalizeHeader("Counselor E-mail")).toBeNull(); // not an alias: surfaced as unknown
    expect(normalizeHeader("counselor_email")).toBe("counselor_email");
  });
});

describe("parseImportFile", () => {
  it("fails the whole file when a required column is missing", () => {
    const { rows, headerErrors } = parseImportFile("household_name,first_name\nA,B\n");
    expect(rows).toEqual([]);
    expect(headerErrors).toEqual([
      'Missing required column "student_last_name"',
      'Missing required column "graduation_year"',
    ]);
  });

  it("types valid rows and defaults the relationship to parent", () => {
    const text = [
      "Household,First Name,Last Name,Class of,Parent First Name,Parent Last Name,Parent Email,Counselor",
      "Rivera Household,Maya,Rivera,2028,Ana,Rivera,ANA@Example.com,coach@firm.test",
    ].join("\n");
    const { rows, headerErrors, unknownHeaders } = parseImportFile(text);
    expect(headerErrors).toEqual([]);
    expect(unknownHeaders).toEqual([]);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.line).toBe(2);
    expect(r.graduation_year).toBe(2028);
    expect(r.parent_email).toBe("ana@example.com");
    expect(r.parent_relationship).toBe("parent");
    expect(r.counselor_email).toBe("coach@firm.test");
    expect(r.errors).toEqual([]);
  });

  it("collects per-row errors without dropping the row", () => {
    const text = [
      "household_name,student_first_name,student_last_name,graduation_year,parent_first_name,parent_email,parent_relationship",
      ",Maya,,20x8,Ana,not-an-email,cousin",
    ].join("\n");
    const { rows } = parseImportFile(text);
    expect(rows[0].errors).toEqual([
      "Household name is required",
      "Student last name is required",
      "Graduation year must be a 4-digit year",
      "Parent email is not valid",
      "Parent first and last name are required with a parent email",
      "Relationship must be one of parent, guardian, sibling, other",
    ]);
  });

  it("requires an email when parent names are given", () => {
    const text = [
      "household_name,student_first_name,student_last_name,graduation_year,parent_first_name,parent_last_name",
      "H,A,B,2027,Ana,Rivera",
    ].join("\n");
    expect(parseImportFile(text).rows[0].errors).toEqual([
      "Parent email is required to add a parent",
    ]);
  });

  it("round-trips its own template", () => {
    const { rows, headerErrors } = parseImportFile(importTemplateCsv());
    expect(headerErrors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].errors).toEqual([]);
  });
});

describe("nameKey", () => {
  it("ignores case and whitespace", () => {
    expect(nameKey(" Rivera  Household ")).toBe(nameKey("rivera household"));
    expect(nameKey("Maya", "Rivera", 2028)).toBe("maya|rivera|2028");
  });
});
