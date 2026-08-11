import { describe, it, expect } from "vitest";
import { parseListParams } from "@/lib/list-params";

const KEYS = ["name", "graduation_year", "status"] as const;

describe("parseListParams (fix plan 11.1)", () => {
  it("defaults to page 1 and no sort", () => {
    expect(parseListParams({}, KEYS)).toEqual({ page: 1, sort: undefined });
  });

  it("parses a valid page", () => {
    expect(parseListParams({ page: "3" }, KEYS).page).toBe(3);
  });

  it("clamps junk/zero/negative pages to 1", () => {
    expect(parseListParams({ page: "0" }, KEYS).page).toBe(1);
    expect(parseListParams({ page: "-2" }, KEYS).page).toBe(1);
    expect(parseListParams({ page: "abc" }, KEYS).page).toBe(1);
  });

  it("accepts a recognized sort key with direction", () => {
    expect(parseListParams({ sort: "status", dir: "desc" }, KEYS).sort).toEqual({
      key: "status",
      dir: "desc",
    });
  });

  it("defaults direction to asc", () => {
    expect(parseListParams({ sort: "name" }, KEYS).sort).toEqual({
      key: "name",
      dir: "asc",
    });
  });

  it("ignores an unrecognized sort key (falls back to default order)", () => {
    expect(
      parseListParams({ sort: "counselor_name", dir: "desc" }, KEYS).sort
    ).toBeUndefined();
  });
});
