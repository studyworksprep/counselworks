import { beforeEach, describe, expect, it, vi } from "vitest";
type Invoice = { id: string; document_id: string | null; installment_id: string; invoice_number: string; amount_cents: number; due_on: string; firm_id: string; agreement_id: string };
const state = vi.hoisted(() => ({ policy: true, invoices: [] as Invoice[], documents: 0,
  filters: [] as { table: string; key: string; value: unknown }[],
  installments: [
    { id: "retainer", installment_number: 1, label: "Deposit", amount_cents: 200000, is_retainer: true, due_on: null },
    { id: "elapsed", installment_number: 2, label: "Payment 2", amount_cents: 400000, is_retainer: false, due_on: "2026-11-01" },
    { id: "future", installment_number: 3, label: "Payment 3", amount_cents: 400000, is_retainer: false, due_on: "2027-02-15" },
  ],
}));
vi.mock("@/lib/storage", () => ({ uploadFile: vi.fn(async () => undefined), getStoragePath: (...parts: string[]) => parts.join("/"), BUCKET_DOCUMENTS: "documents" }));
vi.mock("@/lib/billing/pdf", () => ({ renderInvoicePdf: vi.fn(async () => new Uint8Array([1, 2, 3])) }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendInvoicesIssuedEmail: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ createServerClient: () => ({ from(table: string) {
  let operation = "read"; let payload: Record<string, unknown> = {}; const where: Record<string, unknown> = {};
  function result(): { data: unknown; error: null } {
    if (table === "service_agreements") return { data: { id: "agreement", family_id: "family", title: "Agreement", status: "completed", completed_at: "2026-11-19T02:00:00Z", total_fee_cents: 1000000, invoice_not_before_execution: state.policy, signing_recipient_user_id: "parent", signing_token: "a".repeat(48), families: { household_name: "Rivera Family" } }, error: null };
    if (table === "firms") return { data: { name: "Studyworks", timezone: "America/New_York" }, error: null };
    if (table === "users") return { data: { first_name: "Pat", email: "parent@example.com" }, error: null };
    if (table === "agreement_installments") return { data: state.installments, error: null };
    if (table === "documents") return { data: { id: `document-${++state.documents}` }, error: null };
    if (table === "invoices") {
      if (operation === "insert") {
        const invoice = { ...payload, id: `invoice-${state.invoices.length + 1}`, document_id: null } as Invoice;
        state.invoices.push(invoice); return { data: invoice, error: null };
      }
      if (operation === "update") state.invoices.filter((row) => row.id === where.id).forEach((row) => Object.assign(row, payload));
      return { data: state.invoices.map((row) => ({ ...row, installment: { label: state.installments.find((line) => line.id === row.installment_id)?.label } })), error: null };
    }
    return { data: null, error: null };
  }
  const query = {
    select: () => query, order: () => query,
    eq: (key: string, value: unknown) => { where[key] = value; state.filters.push({ table, key, value }); return query; },
    insert: (value: Record<string, unknown>) => { operation = "insert"; payload = value; return query; },
    update: (value: Record<string, unknown>) => { operation = "update"; payload = value; return query; },
    maybeSingle: async () => result(), single: async () => result(),
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return query;
} }) }));

import { generateInvoicesForAgreement } from "@/lib/billing/generate";
import { renderInvoicePdf } from "@/lib/billing/pdf";
import { sendInvoicesIssuedEmail } from "@/lib/email";
beforeEach(() => { vi.clearAllMocks(); state.policy = true; state.invoices = []; state.documents = 0; state.filters = []; });
describe("invoice generation after delayed signing", () => {
  it("stores and emails the firm's actual execution date for elapsed payments, preserves future dates and stays idempotent", async () => {
    const request = { firmId: "firm", agreementId: "agreement", actorUserId: "signer" };
    expect(await generateInvoicesForAgreement(request)).toEqual({ created: 3 });
    expect(state.invoices.map((invoice) => invoice.due_on)).toEqual(["2026-11-18", "2026-11-18", "2027-02-15"]);
    expect(renderInvoicePdf).toHaveBeenCalledWith(expect.objectContaining({ dueOn: "2026-11-18", installmentLabel: "Payment 2" }));
    expect(sendInvoicesIssuedEmail).toHaveBeenCalledWith(expect.objectContaining({ invoices: expect.arrayContaining([expect.objectContaining({ dueOn: "2026-11-18", installmentLabel: "Payment 2" })]) }));
    expect(await generateInvoicesForAgreement(request)).toEqual({ created: 0 });
    expect(state.invoices).toHaveLength(3); expect(sendInvoicesIssuedEmail).toHaveBeenCalledTimes(1);
    for (const table of ["service_agreements", "agreement_installments", "invoices", "firms"]) expect(state.filters).toContainEqual({ table, key: table === "firms" ? "id" : "firm_id", value: "firm" });
  });
  it("keeps older contracts on their originally signed billing policy", async () => {
    state.policy = false;
    expect(await generateInvoicesForAgreement({ firmId: "firm", agreementId: "agreement", actorUserId: "signer" })).toEqual({ created: 3 });
    expect(state.invoices.map((invoice) => invoice.due_on)).toEqual(["2026-11-19", "2026-11-01", "2027-02-15"]);
  });
});
