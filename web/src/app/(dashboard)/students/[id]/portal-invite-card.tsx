"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/modals/modal";
import { formatDate } from "@/lib/utils";
import {
  sendStudentInvite,
  resendStudentInvite,
  revokeStudentInvite,
} from "@/lib/actions/invitations";

interface InvitationSummary {
  id: string;
  email: string;
  status: "pending" | "accepted";
  sent_at: string;
  accepted_at: string | null;
}

interface Props {
  studentId: string;
  studentEmail: string | null;
  invitation: InvitationSummary | null;
  canInvite: boolean;
}

export function PortalInviteCard({
  studentId,
  studentEmail,
  invitation,
  canInvite,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<"new" | "resend">("new");
  const [email, setEmail] = useState(studentEmail ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openSend() {
    setMode("new");
    setEmail(studentEmail ?? "");
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
          ? await sendStudentInvite({ studentId, email, note })
          : invitation
            ? await resendStudentInvite({
                invitationId: invitation.id,
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

  function revoke() {
    if (!invitation) return;
    if (!confirm("Revoke this invitation? The student won't be able to use the existing link.")) {
      return;
    }
    startTransition(async () => {
      const result = await revokeStudentInvite({ invitationId: invitation.id });
      if ("error" in result) {
        alert(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold text-gray-900">Portal Account</h3>
      </CardHeader>
      <CardContent>
        {invitation?.status === "accepted" ? (
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="success">Joined</Badge>
              <span className="text-gray-500">
                {invitation.accepted_at
                  ? formatDate(invitation.accepted_at)
                  : ""}
              </span>
            </div>
            <p className="text-xs text-gray-500">{invitation.email}</p>
          </div>
        ) : invitation?.status === "pending" ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="warning">Pending</Badge>
              <span className="text-gray-500">
                sent {formatDate(invitation.sent_at)}
              </span>
            </div>
            <p className="text-xs text-gray-500">{invitation.email}</p>
            {canInvite && (
              <div className="flex gap-2 pt-1">
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
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-gray-500">
              This student doesn&apos;t have a portal account yet.
            </p>
            {canInvite && (
              <Button size="sm" onClick={openSend} disabled={isPending}>
                Invite to portal
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <Modal
        open={modalOpen}
        onClose={() => !isPending && setModalOpen(false)}
        title={mode === "new" ? "Invite student to portal" : "Resend invitation"}
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
              id="invite-email"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@example.com"
              required
            />
          )}
          <Textarea
            id="invite-note"
            label="Personal note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Looking forward to working with you this year!"
          />
          {error && <p className="text-sm text-danger-500">{error}</p>}
        </div>
      </Modal>
    </Card>
  );
}
