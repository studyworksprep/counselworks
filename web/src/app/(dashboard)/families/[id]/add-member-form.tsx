"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { addFamilyMember } from "@/lib/actions/families";

const relationshipOptions = [
  { value: "parent", label: "Parent" },
  { value: "guardian", label: "Guardian" },
  { value: "sibling", label: "Sibling" },
  { value: "other", label: "Other" },
];

export function AddMemberForm({ familyId }: { familyId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        + Add Member
      </Button>
    );
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addFamilyMember(familyId, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  return (
    <form action={handleSubmit} className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Input
          id="first_name"
          name="first_name"
          label="First Name"
          required
          placeholder="Jane"
        />
        <Input
          id="last_name"
          name="last_name"
          label="Last Name"
          required
          placeholder="Smith"
        />
      </div>
      <Input
        id="email"
        name="email"
        type="email"
        label="Email"
        required
        placeholder="jane@example.com"
      />
      <Select
        id="relationship_type"
        name="relationship_type"
        label="Relationship"
        options={relationshipOptions}
        placeholder="Select relationship"
        required
      />
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" name="is_primary_contact" className="rounded border-gray-300" />
        Primary contact
      </label>
      {error && <p className="text-sm text-danger-500">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={isPending}>
          Add Member
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
