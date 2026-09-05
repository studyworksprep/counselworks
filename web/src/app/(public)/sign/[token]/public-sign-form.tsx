"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { useWriteRefresh } from "@/lib/hooks/use-write-refresh";
import { signAgreementByToken } from "@/lib/actions/public-agreement";

/**
 * Consent + typed-signature form on the secure link (fix plan 12.7). Same
 * fields and consent language as the portal form; the action is authorized
 * by the token, not a session.
 */
export function PublicSignForm({
  token,
  recipientName,
}: {
  token: string;
  recipientName: string;
}) {
  const commitWrite = useWriteRefresh();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signAgreementByToken(token, formData);
      if ("error" in result && result.error) setError(result.error);
      else commitWrite();
    });
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold text-gray-900">
          Sign this agreement, {recipientName}
        </h3>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="consent"
              required
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
            />
            I consent to conducting this transaction electronically and agree
            that typing my name below constitutes my legal signature on this
            agreement.
          </label>
          <Input
            name="signed_name"
            label="Full legal name"
            required
            placeholder="e.g. Alex Rivera"
          />
          <Button type="submit" loading={isPending}>
            Sign agreement
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
