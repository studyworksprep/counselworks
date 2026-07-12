import { describe, it, expect } from "vitest";
import {
  computeNetCost,
  isGiftAid,
  formatUsd,
  AID_KINDS,
  AID_KIND_LABELS,
} from "@/lib/constants/aid";
import {
  registrationNeedsAttention,
  TEST_TYPES,
  TEST_TYPE_LABELS,
  SITTING_STATUSES,
  SITTING_STATUS_LABELS,
} from "@/lib/constants/testing";

describe("aid constants (CLAUDE.md rule 4)", () => {
  it("every aid kind has a label", () => {
    for (const kind of AID_KINDS) {
      expect(AID_KIND_LABELS[kind.value]).toBeTruthy();
    }
  });

  it("only merit and need count as gift aid", () => {
    expect(isGiftAid("merit")).toBe(true);
    expect(isGiftAid("need")).toBe(true);
    expect(isGiftAid("loan")).toBe(false);
    expect(isGiftAid("work_study")).toBe(false);
    expect(isGiftAid("other")).toBe(false);
    expect(isGiftAid("unknown")).toBe(false);
  });
});

describe("computeNetCost", () => {
  it("prefers the award-letter cost over the tuition estimate", () => {
    const result = computeNetCost({
      costOfAttendance: 80000,
      tuitionEstimate: 60000,
      awards: [],
    });
    expect(result.cost).toBe(80000);
    expect(result.costSource).toBe("award_letter");
    expect(result.netCost).toBe(80000);
  });

  it("falls back to the tuition estimate and flags it", () => {
    const result = computeNetCost({
      costOfAttendance: null,
      tuitionEstimate: 55000,
      awards: [{ kind: "merit", annual_amount: 20000 }],
    });
    expect(result.costSource).toBe("tuition_estimate");
    expect(result.netCost).toBe(35000);
  });

  it("only gift aid reduces net cost; loans are totalled separately", () => {
    const result = computeNetCost({
      costOfAttendance: 70000,
      tuitionEstimate: null,
      awards: [
        { kind: "merit", annual_amount: 15000 },
        { kind: "need", annual_amount: 10000 },
        { kind: "loan", annual_amount: 5500 },
        { kind: "work_study", annual_amount: 3000 },
      ],
    });
    expect(result.giftAid).toBe(25000);
    expect(result.otherAid).toBe(8500);
    expect(result.netCost).toBe(45000);
  });

  it("floors net cost at zero (full rides)", () => {
    const result = computeNetCost({
      costOfAttendance: 30000,
      tuitionEstimate: null,
      awards: [{ kind: "merit", annual_amount: 45000 }],
    });
    expect(result.netCost).toBe(0);
  });

  it("returns null net cost when no cost basis is known", () => {
    const result = computeNetCost({
      costOfAttendance: null,
      tuitionEstimate: null,
      awards: [{ kind: "merit", annual_amount: 5000 }],
    });
    expect(result.cost).toBeNull();
    expect(result.netCost).toBeNull();
    expect(result.giftAid).toBe(5000);
  });

  it("ignores negative award amounts defensively", () => {
    const result = computeNetCost({
      costOfAttendance: 50000,
      tuitionEstimate: null,
      awards: [{ kind: "merit", annual_amount: -1000 }],
    });
    expect(result.giftAid).toBe(0);
    expect(result.netCost).toBe(50000);
  });
});

describe("formatUsd", () => {
  it("formats whole dollars with separators", () => {
    expect(formatUsd(12500)).toBe("$12,500");
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(null)).toBe("—");
  });
});

describe("testing constants (CLAUDE.md rule 4)", () => {
  it("every test type and status has a label", () => {
    for (const t of TEST_TYPES) {
      expect(TEST_TYPE_LABELS[t.value]).toBeTruthy();
    }
    for (const s of SITTING_STATUSES) {
      expect(SITTING_STATUS_LABELS[s.value]).toBeTruthy();
    }
  });
});

describe("registrationNeedsAttention", () => {
  const base = {
    status: "planned",
    test_date: "2026-10-03",
    registration_deadline: "2026-09-04",
  };

  it("flags planned sittings with a deadline inside the window", () => {
    expect(registrationNeedsAttention(base, "2026-08-20")).toBe(true);
    expect(registrationNeedsAttention(base, "2026-09-04")).toBe(true);
  });

  it("flags past-due deadlines", () => {
    expect(registrationNeedsAttention(base, "2026-09-10")).toBe(true);
  });

  it("stays quiet far ahead of the deadline", () => {
    expect(registrationNeedsAttention(base, "2026-07-01")).toBe(false);
  });

  it("ignores registered/completed/cancelled sittings", () => {
    for (const status of ["registered", "completed", "cancelled"]) {
      expect(
        registrationNeedsAttention({ ...base, status }, "2026-09-01")
      ).toBe(false);
    }
  });

  it("ignores sittings with no deadline", () => {
    expect(
      registrationNeedsAttention(
        { ...base, registration_deadline: null },
        "2026-09-01"
      )
    ).toBe(false);
  });
});
