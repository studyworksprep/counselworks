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
  defaultTemplateId: "a0000000-0000-4000-8000-000000000003" as string | null,
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
      : table === "firm_settings" ? { firm_id: "a0000000-0000-4000-8000-000000000001", proposal_agreement_template_id: state.defaultTemplateId }
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

import { previewAgreementFromProposal, sendAgreementFromProposal, sendAgreement, updateProposalAgreementTemplate } from "@/lib/actions/agreements";
import { createFamily, addFamilyMember } from "@/lib/actions/families";
import { createStudent } from "@/lib/actions/students";
import { sendAgreementSignatureRequestEmail } from "@/lib/email";
import { buildProposalSchedule } from "@/lib/proposals/schedule";
import { paymentOptionColumns, toStoredPaymentOptions } from "@/lib/proposals/payment-options";
import { initialAgreementTerms } from "@/lib/agreements/draft";
import { toProposalView } from "@/lib/proposals/row";
import { INVOICE_EXECUTION_DATE_TERMS } from "@/lib/constants/billing";

function setup(mode = "new", template = "") {
  const form = new FormData();
  form.set("template_id", template); form.set("family_mode", mode);
  form.set("household_name", "Rivera Family"); form.set("family_id", mode === "existing" ? ids.family : "");
  form.set("service_end_date", "2027-12-31"); form.set("refund_deadline", "2027-05-31");
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
  state.ctx = { dbUserId: "admin", firmId: ids.firm, role: "firm_owner" };
  state.family = { id: ids.family, household_name: "Rivera Family" };
  state.recipient = { id: "parent", first_name: "Pat", email: "pat@example.com" };
  state.defaultTemplateId = ids.template;
  state.template = { id: ids.template, name: "College Admissions Consulting Agreement", body: "# College Admissions Consulting Agreement\n\nFirm wording for {{family_name}}. Fee {{total_fee}}. Prepared {{date}}.\n\n{{services}}\n\n{{test_preparation}}\n\nDeposit {{deposit_fee}}. Remaining {{remaining_fee}}. Minimum earned fee: {{half_fee}}.\n\nServices through {{service_end_date}}. Refund cutoff {{refund_deadline}}.\n\n{{payment_schedule}}\n\nNo guarantee of admission." };
  state.writes = []; state.filters = [];
  state.proposalDenied = false; state.familyDenied = false; state.intakeDenied = false;
});

describe("proposal agreement review", () => {
  it("previews the standard contract and agreed commercial details without proposal history or side effects", async () => {
    const result = await previewAgreementFromProposal("proposal", setup());
    expect(result).toMatchObject({ title: "College Admissions Consulting Agreement", recipientEmail: "pat@example.com" });
    if ("error" in result) throw new Error(result.error);
    for (const text of ["Firm wording for Rivera Family", "Essay coaching", "$10,800.00", "10 test preparation lessons", "Monthly payment 4 of 4", "Deposit $2,000.00", "Remaining $8,800.00", "Minimum earned fee: $5,400.00", "May 31, 2027", "December 31, 2027"]) expect(result.body).toContain(text);
    expect(result.body).not.toContain("First half");
    expect(result.body).not.toMatch(/proposal|Family-authored program notes|valid through|approved by/i);
    expect(result.body.match(/Monthly payment 4 of 4/g)).toHaveLength(1);
    expect(state.writes).toEqual([]);
    expect(createFamily).not.toHaveBeenCalled(); expect(addFamilyMember).not.toHaveBeenCalled(); expect(createStudent).not.toHaveBeenCalled();
    expect(sendAgreementSignatureRequestEmail).not.toHaveBeenCalled();
  });
  it("always resolves the firm default, ignores client template overrides, and scopes the lookup", async () => {
    state.template!.body = "Firm wording for {{family_name}}. Fee {{total_fee}}.";
    const result = await previewAgreementFromProposal("proposal", setup("new", ids.template));
    expect("body" in result && result.body).toContain("Firm wording for Rivera Family. Fee $10,800.00.");
    expect("body" in result && result.body).toContain("Essay coaching");
    expect(state.filters).toContainEqual({ table: "agreement_templates", key: "firm_id", value: ids.firm });
    expect(state.filters).toContainEqual({ table: "firm_settings", key: "firm_id", value: ids.firm });
    expect(state.filters).toContainEqual({ table: "agreement_templates", key: "id", value: ids.template });
    const form = setup(); form.set("template_id", ids.family);
    form.set("service_end_date", "2020-01-01"); // Irrelevant for a template without this field.
    expect(await previewAgreementFromProposal("proposal", form)).toHaveProperty("body");
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
  it("sends the exact reviewed standard contract and installments with proposal context only in the email", async () => {
    const { form, preview } = await reviewed();
    expect(await sendAgreementFromProposal("proposal", form)).toMatchObject({ id: "agreement", familyId: ids.family });
    const written = state.writes.find((w) => w.table === "service_agreements")!.value;
    expect(written).toMatchObject({ template_id: ids.template, body_snapshot: preview.body, title: preview.title });
    expect(written).toMatchObject({ invoice_not_before_execution: true });
    expect(preview.body).toContain(INVOICE_EXECUTION_DATE_TERMS);
    expect(written).toMatchObject({ document_hash: createHash("sha256").update(preview.body).digest("hex") });
    expect(state.writes.find((w) => w.table === "agreement_installments")!.value).toEqual(
      (state.proposal.payment_schedule_json as Record<string, unknown>[]).map((line) => ({ ...line, firm_id: ids.firm, agreement_id: "agreement" }))
    );
    expect(sendAgreementSignatureRequestEmail).toHaveBeenCalledWith(expect.objectContaining({ email: preview.recipientEmail, agreementTitle: preview.title, acceptedProposalTitle: "College plan" }));
  });

  it("sends revised commercial terms and dates without rewriting the approved proposal", async () => {
    const view = toProposalView(state.proposal);
    const terms = initialAgreementTerms({ ...view, totalFeeCents: view.discountedCostCents });
    terms.totalFee = "10000"; terms.servicesSummary = "Updated counseling and essay support";
    terms.testPrepLessons = "12"; terms.additionalSessionRate = "175";
    terms.additionalTerms = "Family check-in meetings are included.";
    terms.payments.forEach((payment, i) => { payment.amount = "2000"; if (i > 0) payment.dueOn = `2027-${String(i + 3).padStart(2, "0")}-15`; });
    const form = setup(); form.set("agreement_terms", JSON.stringify(terms));
    const { preview } = await reviewed(form);
    expect(state.writes).toEqual([]);
    expect(preview.body).toContain("Updated counseling and essay support");
    expect(preview.body).toContain("12 test preparation lessons");
    expect(preview.body).toContain("$175.00 per session");
    expect(preview.body).toContain("Minimum earned fee: $5,000.00");
    expect(preview.body).toContain("July 15, 2027");
    expect(preview.body).toContain(terms.additionalTerms);
    expect(await sendAgreementFromProposal("proposal", form)).toHaveProperty("id", "agreement");
    expect(state.writes.find((write) => write.table === "service_agreements")?.value).toMatchObject({ total_fee_cents: 1000000, retainer_cents: 200000, invoice_not_before_execution: true, body_snapshot: preview.body });
    const payments = state.writes.find((write) => write.table === "agreement_installments")?.value as { due_on: string | null; amount_cents: number }[];
    expect(payments.map((line) => line.due_on)).toEqual([null, "2027-04-15", "2027-05-15", "2027-06-15", "2027-07-15"]);
    expect(payments.reduce((sum, line) => sum + line.amount_cents, 0)).toBe(1000000);
    expect(state.writes.filter((write) => write.table === "proposals").map((write) => write.value)).toEqual([{ family_id: ids.family }, { agreement_id: "agreement", family_id: ids.family }]);
  });

  it("requires fresh review after any material term edit and rejects mismatched payments without side effects", async () => {
    const view = toProposalView(state.proposal);
    for (const field of ["services", "lessons", "additional", "date"]) {
      const terms = initialAgreementTerms({ ...view, totalFeeCents: view.discountedCostCents });
      const form = setup(); form.set("agreement_terms", JSON.stringify(terms));
      await reviewed(form);
      if (field === "services") terms.servicesSummary += " Changed.";
      if (field === "lessons") terms.testPrepLessons = "11";
      if (field === "additional") terms.additionalTerms = "New terms.";
      if (field === "date") terms.payments[1].dueOn = "2027-03-16";
      form.set("agreement_terms", JSON.stringify(terms));
      expect(await sendAgreementFromProposal("proposal", form)).toHaveProperty("error");
    }
    const terms = initialAgreementTerms({ ...view, totalFeeCents: view.discountedCostCents });
    terms.payments[1].amount = "1";
    const form = setup(); form.set("agreement_terms", JSON.stringify(terms));
    expect(await previewAgreementFromProposal("proposal", form)).toHaveProperty("error");
    expect(state.writes).toEqual([]); expect(createFamily).not.toHaveBeenCalled();
    expect(sendAgreementSignatureRequestEmail).not.toHaveBeenCalled();
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

  it("blocks missing defaults, unavailable templates and incomplete or invalid contract dates before writing", async () => {
    state.defaultTemplateId = null;
    expect(await previewAgreementFromProposal("proposal", setup())).toHaveProperty("error");
    state.defaultTemplateId = ids.template;
    for (const [key, value] of [["refund_deadline", ""], ["refund_deadline", "2027-02-30"], ["service_end_date", "2020-01-01"]]) {
      const form = setup(); form.set(key, value);
      expect(await previewAgreementFromProposal("proposal", form)).toHaveProperty("error");
    }
    state.template = null;
    expect(await previewAgreementFromProposal("proposal", setup())).toHaveProperty("error");
    expect(state.writes).toEqual([]);
  });

  it("requires another review when the refund cutoff, service end or standard template changes", async () => {
    for (const key of ["refund_deadline", "service_end_date"]) {
      const { form } = await reviewed(); form.set(key, "2027-11-30");
      expect(await sendAgreementFromProposal("proposal", form)).toHaveProperty("error");
    }
    const { form } = await reviewed(); state.template!.id = ids.family;
    expect(await sendAgreementFromProposal("proposal", form)).toHaveProperty("error");
    expect(state.writes).toEqual([]);
  });

  it("states clearly when no lessons are included and never invents an additional rate", async () => {
    state.proposal.test_prep_lessons = null; state.proposal.additional_session_rate_cents = null;
    const result = await previewAgreementFromProposal("proposal", setup());
    if ("error" in result) throw new Error(result.error);
    expect(result.body).toContain("No test preparation lessons are included");
    expect(result.body).not.toMatch(/\$150|\$165|Additional sessions/);
  });

  it("allows only firm admins to configure an active standard template within their firm", async () => {
    const form = new FormData(); form.set("proposal_agreement_template_id", ids.template);
    state.ctx = null; expect(await updateProposalAgreementTemplate(form)).toHaveProperty("error");
    state.ctx = { dbUserId: "parent", firmId: ids.firm, role: "parent" };
    expect(await updateProposalAgreementTemplate(form)).toHaveProperty("error");
    state.ctx.role = "counselor"; expect(await updateProposalAgreementTemplate(form)).toHaveProperty("error");
    expect(state.writes).toEqual([]);
    state.ctx.role = "firm_owner";
    expect(await updateProposalAgreementTemplate(form)).toEqual({ success: true });
    expect(state.filters).toContainEqual({ table: "agreement_templates", key: "firm_id", value: ids.firm });
    expect(state.filters).toContainEqual({ table: "firm_settings", key: "firm_id", value: ids.firm });
    state.template = null;
    expect(await updateProposalAgreementTemplate(form)).toHaveProperty("error");
  });

});
