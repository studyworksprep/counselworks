import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/invitations", () => ({
  sendStudentInvite: vi.fn(), resendStudentInvite: vi.fn(), revokeStudentInvite: vi.fn(),
}));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => vi.fn() }));

import { PortalInviteCard } from "@/app/(dashboard)/students/[id]/portal-invite-card";

const pending = { id: "invite", email: "old-address@example.test", status: "pending" as const, sent_at: "2026-11-12T12:00:00Z", accepted_at: null };
const accepted = { ...pending, status: "accepted" as const, accepted_at: "2026-11-12T13:00:00Z" };
function render(overrides: Partial<Parameters<typeof PortalInviteCard>[0]> = {}) {
  return renderToStaticMarkup(createElement(PortalInviteCard, {
    studentId: "student", studentEmail: "student@example.test", portalAccountLinked: false,
    invitation: null, canInvite: true, ...overrides,
  }));
}

describe("student portal account display", () => {
  it("shows an existing account without requiring invitation history", () => {
    const html = render({ portalAccountLinked: true });
    expect(html).toContain("Account linked");
    expect(html).toContain("student@example.test");
    expect(html).not.toContain("Invite to portal");
    expect(html).not.toContain("doesn&#x27;t have a portal account");
  });

  it("prioritizes the linked identity over a stale pending invitation", () => {
    const html = render({ portalAccountLinked: true, invitation: pending });
    expect(html).toContain("Account linked");
    expect(html).toContain("student@example.test");
    expect(html).not.toContain("old-address@example.test");
    expect(html).not.toContain(">Resend<");
    expect(html).not.toContain(">Revoke<");
  });

  it("preserves the joined status for a linked account with an accepted invite", () => {
    const html = render({ portalAccountLinked: true, invitation: accepted });
    expect(html).toContain("Joined");
    expect(html).toContain("student@example.test");
    expect(html).not.toContain("Invite to portal");
  });

  it("retains pending-invite management for an unclaimed placeholder", () => {
    const html = render({ invitation: pending });
    expect(html).toContain("Pending");
    expect(html).toContain(">Resend<");
    expect(html).toContain(">Revoke<");
  });

  it("offers an invitation only when no account or invitation is present", () => {
    expect(render()).toContain("Invite to portal");
    expect(render({ canInvite: false })).not.toContain("Invite to portal");
  });

  it("does not report no account or offer an invite after a failed lookup", () => {
    const html = render({ portalAccountLinked: null });
    expect(html).toContain("Portal account status is unavailable");
    expect(html).not.toContain("Invite to portal");
    expect(html).not.toContain("doesn&#x27;t have a portal account");
  });

  it("does not treat accepted invitation history alone as a linked account", () => {
    const html = render({ invitation: accepted });
    expect(html).toContain("Invitation accepted");
    expect(html).toContain("account link is incomplete");
    expect(html).not.toContain("Joined");
    expect(html).not.toContain("Invite to portal");
  });
});
