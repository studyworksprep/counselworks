"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { signAgreement } from "@/lib/actions/agreements";

/** Parent-side consent + typed-signature form (fix plan 10.1). */
export function PortalSignForm({ agreementId }: { agreementId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signAgreement(agreementId, formData);
      if ("error" in result && result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold text-gray-900">
          Sign this agreement
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
