import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorizedProposal } from "@/lib/auth/authorize";

const ids = {
  firm: "a0000000-0000-4000-8000-000000000001",
  family: "a0000000-0000-4000-8000-000000000002",
  template: "a0000000-0000-4000-8000-000000000003",
};
const state = vi.hoisted(() => ({
  ctx: null as { dbUserId: string; firmId: string; role: string } | null,
  proposal: null as unknown as AuthorizedProposal,
  proposalDenied: false, familyDenied: false, intakeDenied: false,
  template: null as { id: string; name: string; body: string } | null,
  family: { id: "", household_name: "Rivera Family" },
  recipient: { id: "parent", first_name: "Pat", email: "pat@example.com" },
  writes: [] as { table: string; kind: string; value: unknown }[],
  filters: [] as { table: string; key: string; value: unknown }[],
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth/resolve", () => ({ resolveUserAndFirm: async () => state.ctx }));
vi.mock("@/lib/auth/authorize", () => ({
  requireProposalAccess: async () => { if (state.proposalDenied) throw new Error("Denied"); return state.proposal; },
  requireFamilyAccess: async () => { if (state.familyDenied) throw new Error("Denied"); },
  requireClientIntake: () => { if (state.intakeDenied) throw new Error("Denied"); },
  requireStaff: vi.fn(),
}));
vi.mock("@/lib/actions/families", () => ({
  createFamily: vi.fn(async () => ({ id: "a0000000-0000-4000-8000-000000000002" })),
  addFamilyMember: vi.fn(async () => ({ success: true })),
}));
vi.mock("@/lib/actions/students", () => ({ createStudent: vi.fn(async () => ({ id: "student" })) }));
vi.mock("@/lib/agreements/sign", () => ({ generateSigningToken: () => "a".repeat(48), recordAgreementSignature: vi.fn() }));
vi.mock("@/lib/billing/generate", () => ({ generateInvoicesForAgreement: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendAgreementSignatureRequestEmail: vi.fn() }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({ from(table: string) {
  function result() {
    const data = table === "firms" ? { name: "Studyworks", timezone: "America/New_York" }
      : table === "agreement_templates" ? state.template
      : table === "families" ? state.family
      : table === "family_members" ? [{ is_primary_contact: true, users: state.recipient }]
      : table === "service_agreements" ? { id: "agreement" } : null;
    return { data, error: null };
  }
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { state.filters.push({ table, key, value }); return query; },
    in: () => query, order: () => query,
    insert: (value: unknown) => { state.writes.push({ table, kind: "insert", value }); return query; },
    update: (value: unknown) => { state.writes.push({ table, kind: "update", value }); return query; },
    delete: () => { state.writes.push({ table, kind: "delete", value: null }); return query; },
    maybeSingle: async () => result(), single: async () => result(),
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return query;
} }) }));

import { previewAgreementFromProposal, sendAgreementFromProposal, sendAgreement } from "@/lib/actions/agreements";
import { createFamily, addFamilyMember } from "@/lib/actions/families";
import { createStudent } from "@/lib/actions/students";
import { sendAgreementSignatureRequestEmail } from "@/lib/email";
import { buildProposalSchedule } from "@/lib/proposals/schedule";
import { paymentOptionColumns, toStoredPaymentOptions } from "@/lib/proposals/payment-options";

function setup(mode = "new", template = "") {
  const form = new FormData();
  form.set("template_id", template); form.set("family_mode", mode);
  form.set("household_name", "Rivera Family"); form.set("family_id", mode === "existing" ? ids.family : "");
  return form;
}
async function reviewed(form = setup()) {
  const preview = await previewAgreementFromProposal("proposal", form);
  if ("error" in preview) throw new Error(preview.error);
  form.set("reviewed", "on"); form.set("review_token", preview.reviewToken);
  return { form, preview };
}

beforeEach(() => {
  vi.clearAllMocks(); vi.useRealTimers();
  const monthly = buildProposalSchedule({ structure: "deposit_monthly", totalCents: 1080000, depositCents: 200000, installmentCount: 4, firstDueOn: "2027-03-15", customLines: [] });
  const half = buildProposalSchedule({ structure: "half_half", totalCents: 1080000, depositCents: null, installmentCount: null, firstDueOn: "2028-01-01", customLines: [] });
  if (!monthly.ok || !half.ok) throw new Error("Bad fixture");
  const chosen = { structure: "deposit_monthly" as const, depositCents: 200000, installmentCount: 4, firstDueOn: "2027-03-15", lines: monthly.lines };
  state.proposal = {
    id: "proposal", firm_id: ids.firm, status: "approved", agreement: null,
    parent_first_name: "Pat", parent_last_name: "Rivera", parent_email: "pat@example.com",
    student_first_name: "Sam", student_last_name: "Rivera", graduation_year: 2028,
    title: "College plan", intro_message: null, services_summary: "- Essay coaching",
    total_cost_cents: 1200000, discount_percent: 10, discounted_cost_cents: 1080000,
    ...paymentOptionColumns(chosen), selected_payment_structure: chosen.structure,
    payment_options_json: toStoredPaymentOptions([
      { structure: "half_half", depositCents: null, installmentCount: null, firstDueOn: "2028-01-01", lines: half.lines }, chosen,
    ]),
    test_prep_lessons: 10, additional_session_rate_cents: 15000,
    terms_and_conditions: "Family-authored program notes.", valid_until: "2026-12-12",
    approved_at: "2026-11-12T18:00:00Z", approved_by_name: "Pat Rivera", approved_via: "link",
    family_id: null, created_by_user_id: "author", updated_at: "version-1",
  } as AuthorizedProposal;
  state.ctx = { dbUserId: "admin", firmId: ids.firm, role: "owner" };
  state.family = { id: ids.family, household_name: "Rivera Family" };
  state.recipient = { id: "parent", first_name: "Pat", email: "pat@example.com" };
  state.template = { id: ids.template, name: "Firm wording", body: "Firm wording for {{family_name}}. Fee {{total_fee}}." };
  state.writes = []; state.filters = [];
  state.proposalDenied = false; state.familyDenied = false; state.intakeDenied = false;
});

describe("proposal agreement review", () => {
  it("previews all approved content with no template or side effects", async () => {
    state.template = null;
    const result = await previewAgreementFromProposal("proposal", setup());
    expect(result).toMatchObject({ title: "Service agreement: College plan", recipientEmail: "pat@example.com" });
    if ("error" in result) throw new Error(result.error);
    for (const text of ["Essay coaching", "Family-authored program notes.", "$10,800.00", "10 test preparation lessons", "Monthly payment 4 of 4", "Selected payment option: Deposit + monthly payments"]) expect(result.body).toContain(text);
    expect(result.body).not.toContain("First half");
    expect(state.writes).toEqual([]);
    expect(createFamily).not.toHaveBeenCalled(); expect(addFamilyMember).not.toHaveBeenCalled(); expect(createStudent).not.toHaveBeenCalled();
    expect(sendAgreementSignatureRequestEmail).not.toHaveBeenCalled();
  });
  it("includes optional firm wording and scopes that lookup to the proposal's firm", async () => {
    const result = await previewAgreementFromProposal("proposal", setup("new", ids.template));
    expect("body" in result && result.body).toContain("Firm wording for Rivera Family. Fee $10,800.00.");
    expect("body" in result && result.body).toContain("Essay coaching");
    expect(state.filters).toContainEqual({ table: "agreement_templates", key: "firm_id", value: ids.firm });
    state.template = null;
    expect(await previewAgreementFromProposal("proposal", setup("new", ids.template))).toHaveProperty("error");
  });
  it("uses the authorized existing family's actual recipient", async () => {
    state.recipient.email = "primary@example.com";
    expect(await previewAgreementFromProposal("proposal", setup("existing"))).toMatchObject({ recipientEmail: "primary@example.com" });
    expect(state.filters).toContainEqual({ table: "family_members", key: "firm_id", value: ids.firm });
    state.familyDenied = true;
    expect(await previewAgreementFromProposal("proposal", setup("existing"))).toEqual({ error: "Family not found" });
  });
  it("rejects unauthenticated, unauthorized, closed, and counselor intake requests", async () => {
    state.ctx = null; expect(await previewAgreementFromProposal("proposal", setup())).toHaveProperty("error");
    state.ctx = { dbUserId: "counselor", firmId: ids.firm, role: "counselor" };
    state.proposalDenied = true; expect(await previewAgreementFromProposal("proposal", setup())).toHaveProperty("error");
    state.proposalDenied = false; state.intakeDenied = true;
    expect(await previewAgreementFromProposal("proposal", setup())).toHaveProperty("error");
    state.intakeDenied = false; state.proposal.status = "withdrawn";
    expect(await previewAgreementFromProposal("proposal", setup("existing"))).toHaveProperty("error");
    expect(state.writes).toEqual([]);
  });
  it("requires review and refuses a changed template, proposal, household or destination before writing", async () => {
    expect(await sendAgreementFromProposal("proposal", setup())).toHaveProperty("error");
    const templateReview = await reviewed(setup("new", ids.template));
    state.template!.body += " Changed.";
    expect(await sendAgreementFromProposal("proposal", templateReview.form)).toHaveProperty("error");
    const renamedTemplate = await reviewed(setup("new", ids.template)); state.template!.name = "Renamed agreement";
    expect(await sendAgreementFromProposal("proposal", renamedTemplate.form)).toHaveProperty("error");
    const proposalReview = await reviewed(); state.proposal.updated_at = "version-2";
    expect(await sendAgreementFromProposal("proposal", proposalReview.form)).toHaveProperty("error");
    const householdReview = await reviewed(); householdReview.form.set("household_name", "Different family");
    expect(await sendAgreementFromProposal("proposal", householdReview.form)).toHaveProperty("error");
    const recipientReview = await reviewed(setup("existing")); state.recipient.email = "changed@example.com";
    expect(await sendAgreementFromProposal("proposal", recipientReview.form)).toHaveProperty("error");
    expect(state.writes).toEqual([]); expect(createFamily).not.toHaveBeenCalled();
    expect(sendAgreementSignatureRequestEmail).not.toHaveBeenCalled();
  });
  it("sends the exact reviewed body and chosen installments with the built-in agreement", async () => {
    const { form, preview } = await reviewed();
    expect(await sendAgreementFromProposal("proposal", form)).toMatchObject({ id: "agreement", familyId: ids.family });
    const written = state.writes.find((w) => w.table === "service_agreements")!.value;
    expect(written).toMatchObject({ template_id: null, body_snapshot: preview.body, title: preview.title });
    expect(written).toMatchObject({ document_hash: createHash("sha256").update(preview.body).digest("hex") });
    expect(state.writes.find((w) => w.table === "agreement_installments")!.value).toEqual(
      (state.proposal.payment_schedule_json as Record<string, unknown>[]).map((line) => ({ ...line, firm_id: ids.firm, agreement_id: "agreement" }))
    );
    expect(sendAgreementSignatureRequestEmail).toHaveBeenCalledWith(expect.objectContaining({ email: preview.recipientEmail, agreementTitle: preview.title }));
  });
  it("requires a fresh preview after the agreement date changes", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-17T15:00:00Z"));
    const { form } = await reviewed();
    vi.setSystemTime(new Date("2026-11-18T15:00:00Z"));
    expect(await sendAgreementFromProposal("proposal", form)).toHaveProperty("error");
    expect(state.writes).toEqual([]);
    vi.useRealTimers();
  });
  it("preserves sending a normal family agreement from an existing template", async () => {
    state.template!.body = "Hello {{family_name}}, from {{firm_name}}.";
    const form = new FormData(); form.set("template_id", ids.template);
    expect(await sendAgreement(ids.family, form)).toMatchObject({ id: "agreement" });
    expect(state.writes.find((w) => w.table === "service_agreements")!.value).toMatchObject({ template_id: ids.template, body_snapshot: "Hello Rivera Family, from Studyworks.", total_fee_cents: null });
  });

});
