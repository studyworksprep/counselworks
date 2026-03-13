"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/modals/modal";
import { updateFamily } from "@/lib/actions/families";

interface FamilyData {
  id: string;
  household_name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_region: string | null;
  postal_code: string | null;
  country: string | null;
}

export function EditFamilyForm({ family }: { family: FamilyData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateFamily(family.id, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit Family
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit Family"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <Input
            name="household_name"
            label="Household Name *"
            required
            defaultValue={family.household_name}
          />

          <Input
            name="address_line1"
            label="Address"
            placeholder="Street address"
            defaultValue={family.address_line1 ?? ""}
          />

          <Input
            name="address_line2"
            label="Address Line 2"
            placeholder="Apt, suite, etc."
            defaultValue={family.address_line2 ?? ""}
          />

          <div className="grid grid-cols-3 gap-4">
            <Input
              name="city"
              label="City"
              defaultValue={family.city ?? ""}
            />
            <Input
              name="state_region"
              label="State"
              defaultValue={family.state_region ?? ""}
            />
            <Input
              name="postal_code"
              label="ZIP Code"
              defaultValue={family.postal_code ?? ""}
            />
          </div>

          <Input
            name="country"
            label="Country"
            defaultValue={family.country ?? ""}
          />

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
