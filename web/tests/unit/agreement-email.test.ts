import { beforeEach, describe, expect, it, vi } from "vitest";
const send = vi.hoisted(() => vi.fn<(message: { html: string; text: string }) => Promise<{ error: null }>>(async () => ({ error: null })));
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
import { sendAgreementSignatureRequestEmail } from "@/lib/email";

const destination = { email: "parent@example.com", parentFirstName: "Pat", firmName: "Studyworks", agreementTitle: "College Admissions Consulting Agreement", signingUrl: "https://example.com/sign/private" };
beforeEach(() => vi.clearAllMocks());
describe("agreement covering email", () => {
  it("explains the proposal connection in both email formats and escapes its title", async () => {
    await sendAgreementSignatureRequestEmail({ ...destination, acceptedProposalTitle: '<img src="x"> & plan' });
    const message = send.mock.calls[0]?.[0] as { html: string; text: string };
    expect(message.html).toContain("follows your accepted proposal");
    expect(message.html).toContain("&lt;img");
    expect(message.html).not.toContain('<img src="x">');
    expect(message.text).toContain("selected payment schedule");
    expect(message.text).toContain("included test preparation lessons");
  });
  it("keeps the ordinary template agreement email free of proposal context", async () => {
    await sendAgreementSignatureRequestEmail(destination);
    const message = send.mock.calls[0]?.[0] as { html: string; text: string };
    expect(message.html).not.toContain("proposal");
    expect(message.text).not.toContain("proposal");
    expect(message.text).toContain(destination.signingUrl);
  });
});
