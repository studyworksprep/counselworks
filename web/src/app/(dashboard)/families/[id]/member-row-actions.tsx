"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/modals/modal";
import {
  updateFamilyMember,
  removeFamilyMember,
  deactivatePortalAccount,
} from "@/lib/actions/families";

const relationshipOptions = [
  { value: "parent", label: "Parent" },
  { value: "guardian", label: "Guardian" },
  { value: "sibling", label: "Sibling" },
  { value: "other", label: "Other" },
];

/**
 * Member lifecycle controls (fix plan 8.9): edit relationship (and name
 * while unclaimed), remove from the household, and deactivate an active
 * portal account (owner/admin).
 */
export function MemberRowActions({
  member,
  canDeactivate,
}: {
  member: {
    id: string;
    first_name: string;
    last_name: string;
    relationship_type: string;
    portal_status: "active" | "pending" | "none";
  };
  canDeactivate: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isClaimed = member.portal_status === "active";

  function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateFamilyMember(member.id, formData);
      if (result.error) setError(result.error);
      else {
        setEditOpen(false);
        router.refresh();
      }
    });
  }

  function handleRemove() {
    if (
      !confirm(
        `Remove ${member.first_name} from this household? Their account (if any) is kept — only the family link is removed.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await removeFamilyMember(member.id);
      if (result.error) alert(result.error);
      else router.refresh();
    });
  }

  function handleDeactivate() {
    if (
      !confirm(
        `Deactivate ${member.first_name}'s portal access? They will no longer be able to sign in to the family portal.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await deactivatePortalAccount(member.id);
      if (result.error) alert(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setEditOpen(true)}
        className="text-xs text-gray-400 hover:text-gray-700"
        aria-label={`Edit ${member.first_name}`}
      >
        Edit
      </button>
      <button
        type="button"
        onClick={handleRemove}
        disabled={isPending}
        className="text-xs text-gray-400 hover:text-red-600"
        aria-label={`Remove ${member.first_name} from household`}
      >
        Remove
      </button>
      {isClaimed && canDeactivate && (
        <button
          type="button"
          onClick={handleDeactivate}
          disabled={isPending}
          className="text-xs text-gray-400 hover:text-red-600"
          aria-label={`Deactivate ${member.first_name}'s portal access`}
        >
          Deactivate portal
        </button>
      )}

      <Modal
        open={editOpen}
        onClose={() => !isPending && setEditOpen(false)}
        title={`Edit ${member.first_name} ${member.last_name}`}
      >
        <form onSubmit={handleEdit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {isClaimed ? (
            <p className="text-xs text-gray-500">
              This member has an active portal account and manages their own
              name and email.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Input
                name="first_name"
                label="First Name"
                defaultValue={member.first_name}
              />
              <Input
                name="last_name"
                label="Last Name"
                defaultValue={member.last_name}
              />
            </div>
          )}
          <Select
            name="relationship_type"
            label="Relationship"
            defaultValue={member.relationship_type}
            options={relationshipOptions}
          />
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
