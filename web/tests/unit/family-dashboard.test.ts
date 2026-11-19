import { describe, expect, it } from "vitest";
import {
  ATTENTION_TASK_LIMIT,
  awaitsFamilySignature,
  buildAttentionItems,
  daysBetween,
  summarizeChildApplications,
  summarizePayments,
  type AttentionInvoice,
  type AttentionTask,
  type ChildApplication,
} from "@/lib/family/dashboard";

const TODAY = "2026-11-19";
const fmtDate = (v: string) => v.slice(0, 10);
const fmtMoney = (c: number) => `$${(c / 100).toFixed(2)}`;

function invoice(over: Partial<AttentionInvoice>): AttentionInvoice {
  return {
    id: "inv",
    invoice_number: "INV-0001",
    label: "Retainer",
    status: "open",
    due_on: TODAY,
    balance_cents: 100_00,
    ...over,
  };
}

function task(over: Partial<AttentionTask>): AttentionTask {
  return {
    id: "t",
    title: "Task",
    status: "pending",
    due_at: null,
    due_on: null,
    dependency_blocked: false,
    isMine: true,
    canComplete: true,
    students: { first_name: "Sam" },
    ...over,
  };
}

function build(over: Partial<Parameters<typeof buildAttentionItems>[0]> = {}) {
  return buildAttentionItems({
    today: TODAY,
    invoices: [],
    agreements: [],
    documentRequests: [],
    tasks: [],
    formatDate: fmtDate,
    formatMoney: fmtMoney,
    ...over,
  });
}

describe("family dashboard: payments", () => {
  it("counts overdue balances and ones due within 30 days, not later installments", () => {
    const summary = summarizePayments(
      [
        invoice({ id: "a", due_on: "2026-11-16", balance_cents: 3000_00 }),
        invoice({ id: "b", due_on: "2026-12-10", balance_cents: 500_00 }),
        invoice({ id: "c", due_on: "2027-01-15", balance_cents: 4500_00 }),
        invoice({ id: "d", due_on: "2026-11-01", status: "paid", balance_cents: 0 }),
        invoice({ id: "e", due_on: "2026-11-01", status: "void" }),
      ],
      TODAY
    );
    expect(summary?.overdue_cents).toBe(3000_00);
    expect(summary?.upcoming_cents).toBe(500_00);
    expect(summary?.invoices.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("is null when nothing is due soon", () => {
    expect(summarizePayments([invoice({ due_on: "2027-03-01" })], TODAY)).toBeNull();
    // An invoice settled down to zero is not a payment to make.
    expect(summarizePayments([invoice({ due_on: "2026-11-01", balance_cents: 0 })], TODAY)).toBeNull();
  });

  it("collapses every due invoice into one item with one pay action", () => {
    const { items } = build({
      invoices: [
        invoice({ id: "a", invoice_number: "INV-0111", due_on: "2026-11-16", balance_cents: 3000_00 }),
        invoice({ id: "b", due_on: "2026-12-01", balance_cents: 450_00 }),
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "payment",
      href: "/family-billing",
      overdue: true,
      title: "$3000.00 overdue · $450.00 due 2026-12-01",
    });
    expect(items[0].detail).toContain("INV-0111 · Retainer · was due 2026-11-16 · and 1 more invoice");
  });
});

describe("family dashboard: attention items", () => {
  it("lists agreements only while the family signature is missing", () => {
    expect(awaitsFamilySignature({ id: "a", title: "A", status: "sent", signed_roles: [] })).toBe(true);
    expect(
      awaitsFamilySignature({ id: "a", title: "A", status: "partially_signed", signed_roles: ["firm"] })
    ).toBe(true);
    expect(
      awaitsFamilySignature({ id: "a", title: "A", status: "partially_signed", signed_roles: ["family"] })
    ).toBe(false);
    expect(awaitsFamilySignature({ id: "a", title: "A", status: "completed", signed_roles: [] })).toBe(false);
    expect(awaitsFamilySignature({ id: "a", title: "A", status: "draft", signed_roles: [] })).toBe(false);
  });

  it("keeps only the parent's own actionable tasks", () => {
    const { items } = build({
      tasks: [
        task({ id: "mine", title: "Mine" }),
        task({ id: "theirs", isMine: false }),
        task({ id: "review", status: "submitted" }),
        task({ id: "done", status: "completed" }),
        task({ id: "blocked", dependency_blocked: true }),
        task({ id: "redo", status: "changes_requested", canComplete: false }),
      ],
    });
    expect(items.map((i) => i.taskId)).toEqual(["mine", "redo"]);
    expect(items[0]).toMatchObject({ href: "/family-tasks/mine", canComplete: true, title: "Mine" });
    expect(items[1].detail).toContain("Changes requested");
  });

  it("puts overdue items first, then agreements, payments, documents, tasks", () => {
    const { items } = build({
      invoices: [invoice({ due_on: "2026-12-01" })],
      agreements: [{ id: "ag", title: "Engagement", status: "sent", signed_roles: [] }],
      documentRequests: [
        { id: "doc", title: "Transcript", due_at: null, student_name: "Sam Lee", requested_by: "Carl" },
        {
          id: "late",
          title: "Tax form",
          due_at: "2026-11-10T00:00:00+00:00",
          student_name: null,
          requested_by: "Carl",
        },
      ],
      tasks: [task({ id: "t1", due_on: "2026-12-20" }), task({ id: "t0", due_on: "2026-11-18" })],
    });
    expect(items.map((i) => i.key)).toEqual([
      "document-late",
      "task-t0",
      "agreement-ag",
      "payments",
      "document-doc",
      "task-t1",
    ]);
    expect(items.find((i) => i.key === "document-doc")).toMatchObject({
      href: "/family-documents#request-doc",
      detail: "For Sam Lee · Requested by Carl",
    });
  });

  it("caps the task rows and reports how many more there are", () => {
    const many = Array.from({ length: ATTENTION_TASK_LIMIT + 2 }, (_, i) => task({ id: `t${i}` }));
    const { items, hiddenTaskCount } = build({ tasks: many });
    expect(items).toHaveLength(ATTENTION_TASK_LIMIT);
    expect(hiddenTaskCount).toBe(2);
  });

  it("is empty when nothing waits on the parent", () => {
    expect(build()).toEqual({ items: [], payments: null, hiddenTaskCount: 0 });
  });
});

describe("family dashboard: per-child applications", () => {
  function app(over: Partial<ChildApplication>): ChildApplication {
    return {
      id: "a",
      college_name: "College",
      application_type: "rd",
      stage: "in_progress",
      deadline_at: null,
      submitted_at: null,
      decision_result: null,
      ...over,
    };
  }

  it("does not read a decided child as having nothing in progress", () => {
    const summary = summarizeChildApplications(
      [app({ id: "h", college_name: "Harvard", stage: "decision_received", decision_result: "accepted" })],
      TODAY
    );
    expect(summary.total).toBe(1);
    expect(summary.stages).toEqual([{ stage: "decision_received", count: 1 }]);
    expect(summary.decisions.map((d) => d.college_name)).toEqual(["Harvard"]);
    expect(summary.nextDeadline).toBeNull();
  });

  it("orders stages along the pipeline and finds the next open deadline", () => {
    const summary = summarizeChildApplications(
      [
        app({ id: "w", stage: "withdrawn" }),
        app({ id: "s", stage: "submitted", deadline_at: "2026-11-25T00:00:00+00:00", submitted_at: "2026-11-01" }),
        app({ id: "late", stage: "in_progress", deadline_at: "2027-01-02T00:00:00+00:00" }),
        app({ id: "soon", stage: "not_started", deadline_at: "2026-12-01T00:00:00+00:00" }),
        app({ id: "past", stage: "in_progress", deadline_at: "2026-11-01T00:00:00+00:00" }),
      ],
      TODAY
    );
    expect(summary.stages.map((s) => s.stage)).toEqual([
      "not_started",
      "in_progress",
      "submitted",
      "withdrawn",
    ]);
    expect(summary.stages.find((s) => s.stage === "in_progress")?.count).toBe(2);
    expect(summary.nextDeadline).toMatchObject({ id: "soon", daysAway: 12 });
  });

  it("counts calendar days without timezone drift", () => {
    expect(daysBetween("2026-11-19", "2026-11-19T00:00:00+00:00")).toBe(0);
    expect(daysBetween("2026-11-19", "2026-11-20")).toBe(1);
    expect(daysBetween("2026-11-19", "2026-11-16")).toBe(-3);
  });
});
