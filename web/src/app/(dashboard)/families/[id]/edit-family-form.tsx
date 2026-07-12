"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import {
  updateFamily,
  archiveFamily,
  unarchiveFamily,
} from "@/lib/actions/families";

interface FamilyData {
  id: string;
  household_name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state_region: string | null;
  postal_code: string | null;
  country: string | null;
  archived_at: string | null;
}

export function EditFamilyForm({
  family,
  canArchive,
}: {
  family: FamilyData;
  canArchive: boolean;
}) {
  const confirmDialog = useConfirm();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isArchived = family.archived_at !== null;

  async function handleArchiveToggle() {
    if (
      !isArchived &&
      !(await confirmDialog({
        title: "Archive this family?",
        body: "The household will be removed from the roster (recoverable via the Archived filter).",
        destructive: true,
        confirmLabel: "Archive",
      }))
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = isArchived
        ? await unarchiveFamily(family.id)
        : await archiveFamily(family.id);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  }

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
            <Alert>{error}</Alert>
          )}

          <Input
            name="household_name"
            label="Household Name"
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

          {canArchive && (
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-gray-900">
                    {isArchived ? "Restore family" : "Archive family"}
                  </h4>
                  <p className="text-xs text-gray-500">
                    {isArchived
                      ? "Return this household to the active roster."
                      : "Remove from the roster; find it later under the Archived filter."}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={handleArchiveToggle}
                  className={isArchived ? "" : "text-danger-600 border-danger-200 hover:bg-danger-50"}
                >
                  {isArchived ? "Restore" : "Archive"}
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isPending}>
              Save Changes
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
