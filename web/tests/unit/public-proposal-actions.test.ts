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
    view: { title: "Counseling", studentName: "Student", parentName: "Parent", validUntil: "2027-01-01" },
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
