"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import { addStudentCollege } from "@/lib/actions/colleges";

const CATEGORY_OPTIONS = [
  { value: "safety", label: "Safety" },
  { value: "likely", label: "Likely" },
  { value: "target", label: "Target" },
  { value: "reach", label: "Reach" },
  { value: "far_reach", label: "Far Reach" },
];

const ROUND_OPTIONS = [
  { value: "", label: "Undecided" },
  { value: "ea", label: "Early Action" },
  { value: "ed", label: "Early Decision" },
  { value: "ed2", label: "Early Decision II" },
  { value: "rea", label: "Restrictive Early Action" },
  { value: "rd", label: "Regular Decision" },
  { value: "rolling", label: "Rolling" },
];

/**
 * Add a college to a student's list from Discover/Recommend results —
 * closes the "research tools dead-end back at the detail page" gap.
 * When studentId is provided (Recommend) the student is fixed; otherwise
 * (Discover) the modal offers a student select.
 */
export function AddToListButton({
  collegeId,
  collegeName,
  studentId,
  students,
}: {
  collegeId: string;
  collegeName: string;
  studentId?: string;
  students?: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("college_id", collegeId);
    if (studentId) formData.set("student_id", studentId);
    startTransition(async () => {
      const result = await addStudentCollege(formData);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setAdded(true);
      router.refresh();
    });
  }

  if (added) {
    return (
      <span className="text-xs font-medium text-success-600">Added ✓</span>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        Add to list
      </Button>
      <Modal
        open={open}
        onClose={() => !isPending && setOpen(false)}
        title={`Add ${collegeName} to a college list`}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert>{error}</Alert>
          )}
          {!studentId && students && (
            <Select
              name="student_id"
              label="Student *"
              placeholder="Select student"
              options={students.map((s) => ({ value: s.id, label: s.name }))}
            />
          )}
          {/* Required with a placeholder — a silent "Safety" default filed
              recommended reaches as safeties (fix plan 7.9). */}
          <Select
            name="category"
            label="Category *"
            required
            placeholder="Select category"
            options={CATEGORY_OPTIONS}
          />
          <Select name="round_type" label="Application round" options={ROUND_OPTIONS} />
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Adding..." : "Add to list"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
