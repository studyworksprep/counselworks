import { describe, expect, it } from "vitest";
import {
  renderAgreementBody,
  nextAgreementStatus,
} from "@/lib/agreements/render";
import { renderSignedAgreementPdf } from "@/lib/agreements/pdf";

describe("agreement template rendering (fix plan 10.1)", () => {
  it("substitutes every supported placeholder, everywhere it appears", () => {
    const out = renderAgreementBody(
      "{{firm_name}} agrees with {{family_name}} on {{date}}. Signed, {{firm_name}}.",
      { firm_name: "Acme Counseling", family_name: "The Lees", date: "July 12, 2026" }
    );
    expect(out).toBe(
      "Acme Counseling agrees with The Lees on July 12, 2026. Signed, Acme Counseling."
    );
  });
});

describe("agreement signing state machine", () => {
  it("one signature → partially signed; both → completed", () => {
    expect(nextAgreementStatus("sent", new Set(["firm"]))).toBe(
      "partially_signed"
    );
    expect(nextAgreementStatus("sent", new Set(["family"]))).toBe(
      "partially_signed"
    );
    expect(
      nextAgreementStatus("partially_signed", new Set(["firm", "family"]))
    ).toBe("completed");
  });

  it("completed and voided agreements accept no further signatures", () => {
    expect(() =>
      nextAgreementStatus("completed", new Set(["firm", "family"]))
    ).toThrow(/completed/);
    expect(() => nextAgreementStatus("voided", new Set(["firm"]))).toThrow(
      /voided/
    );
  });
});

describe("signed agreement PDF", () => {
  it("renders a non-empty PDF for a signed agreement", async () => {
    const bytes = await renderSignedAgreementPdf({
      title: "Engagement Letter",
      firmName: "Acme Counseling",
      body: "Terms of engagement.\n\nSection 1. Services.\n" + "Long paragraph. ".repeat(200),
      documentHash: "a".repeat(64),
      signatures: [
        {
          role: "firm",
          signedName: "Jordan Ellis",
          signerEmail: "jordan@acme.test",
          signedAt: "Mon, 01 Jun 2026 12:00:00 GMT",
          ipAddress: "203.0.113.5",
        },
        {
          role: "family",
          signedName: "Alex Rivera",
          signerEmail: "alex@family.test",
          signedAt: "Tue, 02 Jun 2026 12:00:00 GMT",
          ipAddress: null,
        },
      ],
    });
    expect(bytes.byteLength).toBeGreaterThan(1000);
    // PDF magic bytes
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });
});
