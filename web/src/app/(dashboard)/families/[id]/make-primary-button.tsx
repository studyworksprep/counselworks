"use client";
import { Button } from "@/components/ui/button";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPrimaryContact } from "@/lib/actions/families";

/**
 * Moves the primary-contact flag to this member (fix plan 7.8). The server
 * action demotes the current primary, so exactly one badge ever renders.
 */
export function MakePrimaryButton({ familyMemberId }: { familyMemberId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await setPrimaryContact(familyMemberId);
      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" variant="ghost" icon="check" className="px-2 py-1 text-xs" onClick={handleClick} disabled={isPending}>
        Make primary
      </Button>
      {error && <span className="text-xs text-danger-500">{error}</span>}
    </span>
  );
}
