"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/modals/modal";
import { formatDate } from "@/lib/utils";
import {
  sendParentInvite,
  resendParentInvite,
  revokeParentInvite,
} from "@/lib/actions/invitations";

interface Props {
  familyMemberId: string;
  memberName: string;
  memberEmail: string;
  portalStatus: "active" | "pending" | "none";
  pendingInvitation: { id: string; email: string; sent_at: string } | null;
  canInvite: boolean;
}

/**
 * Portal-access controls for one family member (family portal invitation).
 * Rendered next to parent/guardian rows on the family page.
 */
export function MemberPortalActions({
  familyMemberId,
  memberName,
  memberEmail,
  portalStatus,
  pendingInvitation,
  canInvite,
}: Props) {
  const confirmDialog = useConfirm();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<"new" | "resend">("new");
  const [email, setEmail] = useState(memberEmail);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (portalStatus === "active") {
    return <Badge variant="success">Portal active</Badge>;
  }

  function openSend() {
    setMode("new");
    setEmail(memberEmail);
    setNote("");
    setError(null);
    setModalOpen(true);
  }

  function openResend() {
    setMode("resend");
    setNote("");
    setError(null);
    setModalOpen(true);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "new"
          ? await sendParentInvite({ familyMemberId, email, note })
          : pendingInvitation
            ? await resendParentInvite({
                invitationId: pendingInvitation.id,
                note,
              })
            : { error: "No invitation to resend" };
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setModalOpen(false);
    });
  }

  async function revoke() {
    if (!pendingInvitation) return;
    if (
      !(await confirmDialog({
        title: "Revoke this invitation?",
        body: "The existing sign-up link will stop working.",
        destructive: true,
        confirmLabel: "Revoke",
      }))
    ) {
      return;
    }
    startTransition(async () => {
      const result = await revokeParentInvite({
        invitationId: pendingInvitation.id,
      });
      if ("error" in result) toast(result.error, "error");
    });
  }

  return (
    <div className="flex items-center gap-2">
      {portalStatus === "pending" ? (
        <>
          <Badge variant="warning">
            Invite sent{" "}
            {pendingInvitation ? formatDate(pendingInvitation.sent_at) : ""}
          </Badge>
          {canInvite && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={openResend}
                disabled={isPending}
              >
                Resend
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={revoke}
                disabled={isPending}
              >
                Revoke
              </Button>
            </>
          )}
        </>
      ) : canInvite ? (
        <Button size="sm" variant="outline" onClick={openSend} disabled={isPending}>
          Invite to portal
        </Button>
      ) : null}

      <Modal
        open={modalOpen}
        onClose={() => !isPending && setModalOpen(false)}
        title={
          mode === "new"
            ? `Invite ${memberName} to the family portal`
            : "Resend invitation"
        }
        description={
          mode === "new"
            ? "We'll send a sign-up link to the email below."
            : "This revokes the current link and sends a fresh one."
        }
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setModalOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={submit} loading={isPending}>
              {mode === "new" ? "Send invite" : "Resend"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {mode === "new" && (
            <Input
              id="parent-invite-email"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="parent@example.com"
              required
            />
          )}
          <Textarea
            id="parent-invite-note"
            label="Personal note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="You'll be able to follow deadlines, documents, and progress here."
          />
          {error && <p className="text-sm text-danger-500">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
