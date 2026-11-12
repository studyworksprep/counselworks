"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { useWriteRefresh } from "@/lib/hooks/use-write-refresh";

/**
 * Approve form on the public proposal page. The action arrives already
 * bound to the token and to the fingerprint of the terms on screen, so the
 * form only supplies the typed name and the confirmation.
 */
export function ProposalApproveForm({
  approve,
  firmName,
  parentFirstName,
}: {
  approve: (
    formData: FormData
  ) => Promise<{ error: string } | { success: true }>;
  firmName: string;
  parentFirstName: string;
}) {
  const commitWrite = useWriteRefresh();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await approve(formData);
      if ("error" in result) setError(result.error);
      // Repaint either way: success shows the approved state, and a
      // "proposal was updated" refusal must show the current terms.
      commitWrite();
    });
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-gray-900">
          Ready to move forward, {parentFirstName}?
        </h2>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <p className="text-sm text-gray-600">
            Approving tells {firmName} you&apos;d like to proceed on these
            terms. It is not a contract — you&apos;ll receive a service
            agreement to review and sign next.
          </p>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="confirm"
              required
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
            />
            I have reviewed this proposal and approve its services, fees, and
            terms.
          </label>
          <Input
            id="approved_by_name"
            name="approved_by_name"
            label="Your full name"
            required
            maxLength={120}
            placeholder="e.g. Alex Rivera"
          />
          <Button type="submit" loading={isPending}>
            Approve proposal
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
