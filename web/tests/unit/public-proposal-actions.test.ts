import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposalLinkContext } from "@/lib/proposals/public-link";

const state = vi.hoisted(() => ({
  link: null as unknown as ProposalLinkContext | null,
  filters: [] as [string, unknown][],
  changes: null as Record<string, unknown> | null,
  changed: true,
  dbError: null as { message: string } | null,
  notices: [] as Record<string, unknown>[],
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/proposals/public-link", () => ({ loadProposalLink: async () => state.link }));
vi.mock("@/lib/email", () => ({ sendProposalRejectedStaffEmail: vi.fn(), sendProposalApprovedStaffEmail: vi.fn() }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ createServerClient: () => ({ from(table: string) {
  const query = {
    update: (changes: Record<string, unknown>) => { state.changes = changes; return query; },
    eq: (key: string, value: unknown) => { state.filters.push([key, value]); return query; },
    select: async () => ({ data: state.changed ? [{ id: "proposal" }] : [], error: state.dbError }),
    insert: async (notice: Record<string, unknown>) => { if (table === "notifications") state.notices.push(notice); return { error: null }; },
  };
  return query;
} }) }));

import { approveProposalByToken, rejectProposalByToken } from "@/lib/actions/public-proposal";
import { sendProposalRejectedStaffEmail } from "@/lib/email";
import { recordAuditEvent } from "@/lib/audit";

function feedback(value: string | Blob = "Could we adjust the payment schedule?") {
  const form = new FormData();
  form.set("rejection_comment", value);
  return form;
}
beforeEach(() => {
  vi.clearAllMocks();
  state.link = {
    proposalId: "proposal", firmId: "firm", authorUserId: "author", status: "sent",
    updatedAt: "version-1", termsFingerprint: "terms-1", expired: false,
    view: { paymentOptions: [{ structure: "half_half", depositCents: null, installmentCount: null, firstDueOn: "2027-01-01", lines: [{ installmentNumber: 1, label: "Fee", amountCents: 10000, isRetainer: true, dueOn: null }] }], discountedCostCents: 10000, title: "Counseling", studentName: "Student", parentName: "Parent", validUntil: "2027-01-01" },
    todayIso: "2026-11-12", author: { email: "author@example.com", firstName: "Counselor" },
  } as ProposalLinkContext;
  state.filters = []; state.changes = null; state.changed = true; state.dbError = null; state.notices = [];
});

describe("token-authorized proposal rejection", () => {
  it("requires bounded text feedback, even for a crafted form submission", async () => {
    for (const value of ["", " \n ", "a".repeat(5001), new Blob(["file"])]) {
      expect(await rejectProposalByToken("token", "terms-1", feedback(value))).toHaveProperty("error");
    }
    expect(state.changes).toBeNull();
  });
  it("denies invalid links, closed proposals, and expired proposals", async () => {
    state.link = null;
    expect(await rejectProposalByToken("token", "terms-1", feedback())).toHaveProperty("error");
    state.link = { status: "approved" } as ProposalLinkContext;
    expect(await rejectProposalByToken("token", "terms-1", feedback())).toHaveProperty("error");
    state.link.status = "rejected";
    expect(await rejectProposalByToken("token", "terms-1", feedback())).toHaveProperty("error");
    state.link.status = "sent"; state.link.expired = true;
    expect(await rejectProposalByToken("token", "terms-1", feedback())).toHaveProperty("error");
    expect(state.changes).toBeNull();
  });
  it("refuses feedback on terms changed since the page was opened", async () => {
    expect(await rejectProposalByToken("token", "older-terms", feedback())).toHaveProperty("error");
    expect(state.changes).toBeNull();
    expect(state.notices).toEqual([]);
  });
  it("persists trimmed feedback only for the addressed proposal and its current version", async () => {
    expect(await rejectProposalByToken("secret-token", "terms-1", feedback("  Please revise.\nThanks.  "))).toEqual({ success: true });
    expect(state.changes).toMatchObject({ status: "rejected", rejection_comment: "Please revise.\nThanks." });
    expect(state.filters).toEqual([["id", "proposal"], ["firm_id", "firm"], ["public_token", "secret-token"], ["status", "sent"], ["updated_at", "version-1"]]);
    expect(state.notices).toHaveLength(1);
    expect(state.notices[0]).toMatchObject({ firm_id: "firm", user_id: "author", kind: "proposal_rejected" });
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ actionType: "proposal_rejected", metadata: { author_user_id: "author" } }));
    expect(sendProposalRejectedStaffEmail).toHaveBeenCalledWith(expect.objectContaining({ email: "author@example.com", feedback: "Please revise.\nThanks." }));
  });
  it("does not announce a rejection when an approval, edit, or withdrawal wins the update", async () => {
    state.changed = false;
    expect(await rejectProposalByToken("token", "terms-1", feedback())).toHaveProperty("error");
    expect(state.notices).toEqual([]);
    expect(recordAuditEvent).not.toHaveBeenCalled();
    expect(sendProposalRejectedStaffEmail).not.toHaveBeenCalled();
  });
  it("rejects later approval of a declined proposal", async () => {
    state.link!.status = "rejected";
    const form = new FormData(); form.set("approved_by_name", "Parent"); form.set("confirm", "on");
    expect(await approveProposalByToken("token", "terms-1", form)).toHaveProperty("error");
    expect(state.changes).toBeNull();
  });
});

function approval(choice?: string) {
  const form = new FormData(); form.set("approved_by_name", "Pat Parent"); form.set("confirm", "on");
  if (choice !== undefined) form.set("payment_structure", choice);
  return form;
}
describe("approval payment preference", () => {
  function offerChoice() {
    state.link!.view.paymentOptions.push({ structure: "deposit_monthly", depositCents: 2000, installmentCount: 2, firstDueOn: "2027-02-01", lines: [
      { installmentNumber: 1, label: "Deposit", amountCents: 2000, isRetainer: true, dueOn: null },
      { installmentNumber: 2, label: "Monthly 1", amountCents: 4000, isRetainer: false, dueOn: "2027-02-01" },
      { installmentNumber: 3, label: "Monthly 2", amountCents: 4000, isRetainer: false, dueOn: "2027-03-01" },
    ] });
  }
  it("requires a client preference when more than one option is offered", async () => {
    offerChoice();
    expect(await approveProposalByToken("token", "terms-1", approval())).toHaveProperty("error");
    expect(state.changes).toBeNull(); expect(state.notices).toEqual([]);
  });
  it("rejects unavailable options and non-text choices", async () => {
    offerChoice();
    for (const choice of ["custom", "weekly", ""]) {
      expect(await approveProposalByToken("token", "terms-1", approval(choice))).toHaveProperty("error");
    }
    const form = approval(); form.set("payment_structure", new Blob(["deposit_monthly"]));
    expect(await approveProposalByToken("token", "terms-1", form)).toHaveProperty("error");
    expect(state.changes).toBeNull();
  });
  it("atomically saves the chosen non-default schedule and records the choice for the counselor", async () => {
    offerChoice();
    expect(await approveProposalByToken("secret", "terms-1", approval("deposit_monthly"))).toEqual({ success: true });
    expect(state.changes).toMatchObject({ status: "approved", selected_payment_structure: "deposit_monthly", payment_structure: "deposit_monthly", deposit_cents: 2000, installment_count: 2, first_due_on: "2027-02-01", payment_schedule_json: [{ installment_number: 1, label: "Deposit", amount_cents: 2000, is_retainer: true, due_on: null }, expect.anything(), expect.anything()] });
    expect(state.filters).toContainEqual(["updated_at", "version-1"]);
    expect(state.notices[0].body).toContain("Deposit + monthly payments");
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ metadata: { author_user_id: "author", payment_structure: "deposit_monthly" } }));
  });
  it("preserves single-option approval for existing links", async () => {
    expect(await approveProposalByToken("token", "terms-1", approval())).toEqual({ success: true });
    expect(state.changes).toMatchObject({ selected_payment_structure: "half_half" });
  });
  it("does not save a choice if terms changed, or another response won the race", async () => {
    offerChoice();
    expect(await approveProposalByToken("token", "old-terms", approval("deposit_monthly"))).toHaveProperty("error");
    expect(state.changes).toBeNull();
    state.changed = false;
    expect(await approveProposalByToken("token", "terms-1", approval("deposit_monthly"))).toHaveProperty("error");
    expect(state.notices).toEqual([]); expect(recordAuditEvent).not.toHaveBeenCalled();
  });
  it("allows rejection with feedback before any payment preference is chosen", async () => {
    offerChoice();
    expect(await rejectProposalByToken("token", "terms-1", feedback())).toEqual({ success: true });
    expect(state.changes).not.toHaveProperty("selected_payment_structure");
  });
});
