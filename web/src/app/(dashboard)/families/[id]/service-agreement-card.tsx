"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatDate } from "@/lib/utils";
import {
  sendAgreement,
  signAgreement,
  voidAgreement,
} from "@/lib/actions/agreements";
import type { AgreementSummary } from "@/lib/db/queries";

const STATUS_BADGE: Record<
  string,
  "default" | "primary" | "warning" | "success" | "danger"
> = {
  sent: "warning",
  partially_signed: "primary",
  completed: "success",
  voided: "default",
};

const STATUS_LABEL: Record<string, string> = {
  sent: "Awaiting signatures",
  partially_signed: "Partially signed",
  completed: "Fully executed",
  voided: "Voided",
};

/**
 * Staff-side service agreement panel (fix plan 10.1): send from a template,
 * countersign for the firm, void, and track execution state.
 */
export function ServiceAgreementCard({
  familyId,
  agreements,
  templates,
  canSend,
}: {
  familyId: string;
  agreements: AgreementSummary[];
  templates: { id: string; name: string }[];
  canSend: boolean;
}) {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const [showSend, setShowSend] = useState(false);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await sendAgreement(familyId, formData);
      if ("error" in result && result.error) setError(result.error);
      else {
        setShowSend(false);
        router.refresh();
      }
    });
  }

  function handleFirmSign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!signingId) return;
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signAgreement(signingId, formData);
      if ("error" in result && result.error) setError(result.error);
      else {
        setSigningId(null);
        router.refresh();
      }
    });
  }

  async function handleVoid(id: string) {
    if (
      !(await confirmDialog({
        title: "Void this agreement?",
        body: "The family will no longer be able to sign it.",
        destructive: true,
        confirmLabel: "Void",
      }))
    ) {
      return;
    }
    startTransition(async () => {
      const result = await voidAgreement(id);
      if ("error" in result && result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Service Agreement</h3>
          {canSend && templates.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setShowSend(true)}>
              Send agreement
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && <Alert className="mb-3">{error}</Alert>}
        {agreements.length === 0 ? (
          <p className="text-sm text-gray-500">
            No agreement sent yet.
            {templates.length === 0 &&
              " Create an agreement template in Settings first."}
          </p>
        ) : (
          <ul className="space-y-3">
            {agreements.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-2 border-b border-gray-50 pb-2 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{a.title}</p>
                  <p className="text-xs text-gray-500">
                    Sent {formatDate(a.sent_at)}
                    {a.completed_at &&
                      ` · executed ${formatDate(a.completed_at)}`}
                  </p>
                </div>
                <Badge variant={STATUS_BADGE[a.status] ?? "default"}>
                  {STATUS_LABEL[a.status] ?? a.status}
                </Badge>
                {a.status !== "completed" &&
                  a.status !== "voided" &&
                  !a.signed_roles.includes("firm") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSigningId(a.id)}
                    >
                      Sign for firm
                    </Button>
                  )}
                {a.status !== "completed" && a.status !== "voided" && (
                  <button
                    type="button"
                    onClick={() => handleVoid(a.id)}
                    disabled={isPending}
                    className="text-xs text-gray-400 hover:text-danger-600"
                  >
                    Void
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Modal
        open={showSend}
        onClose={() => !isPending && setShowSend(false)}
        title="Send service agreement"
        description="The family's primary contact is notified by email and signs in the family portal."
      >
        <form onSubmit={handleSend} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Select
            name="template_id"
            label="Agreement template"
            required
            placeholder="Choose a template"
            options={templates.map((t) => ({ value: t.id, label: t.name }))}
          />
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isPending}>
              Send for signature
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowSend(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!signingId}
        onClose={() => !isPending && setSigningId(null)}
        title="Sign for the firm"
        description="Typing your full legal name is your electronic signature."
      >
        <form onSubmit={handleFirmSign} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Input
            name="signed_name"
            label="Full legal name"
            required
            placeholder="e.g. Jordan Ellis"
          />
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="consent"
              required
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
            />
            I consent to signing this agreement electronically on behalf of
            the firm, and intend this to be my legal signature.
          </label>
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isPending}>
              Sign agreement
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSigningId(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
