"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import {
  updateStudent,
  archiveStudent,
  unarchiveStudent,
} from "@/lib/actions/students";
import { EDITABLE_STUDENT_STATUSES } from "@/lib/constants/students";

interface StudentData {
  id: string;
  first_name: string;
  last_name: string;
  graduation_year: number;
  school_name: string | null;
  school_type: string | null;
  status: string;
  preferred_name: string | null;
  academic_interests: string | null;
  extracurricular_summary: string | null;
  gpa_unweighted: number | null;
  gpa_weighted: number | null;
  class_rank: string | null;
  profile: {
    citizenship_status: string | null;
    budget_range: string | null;
    financial_aid_interest: boolean | null;
  } | null;
}

// Shared enum only (fix plan 7.4 — the "inactive" spelling broke the Paused
// filter). "Archived" is deliberately absent: archiving is a separate action
// below that also stamps archived_at (fix plan 7.5).
const statusOptions = EDITABLE_STUDENT_STATUSES.map((s) => ({
  value: s.value,
  label: s.label,
}));

const schoolTypeOptions = [
  { value: "", label: "Not specified" },
  { value: "public", label: "Public" },
  { value: "private", label: "Private" },
  { value: "charter", label: "Charter" },
  { value: "magnet", label: "Magnet" },
  { value: "homeschool", label: "Homeschool" },
];

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 8 }, (_, i) => ({
  value: String(currentYear - 1 + i),
  label: `Class of ${currentYear - 1 + i}`,
}));

export function EditStudentForm({
  student,
  canArchive,
}: {
  student: StudentData;
  canArchive: boolean;
}) {
  const confirmDialog = useConfirm();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isArchived = student.status === "archived";

  async function handleArchiveToggle() {
    if (
      !isArchived &&
      !(await confirmDialog({
        title: "Archive this student?",
        body: "They will be removed from the roster (recoverable via the Archived filter).",
        destructive: true,
        confirmLabel: "Archive",
      }))
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = isArchived
        ? await unarchiveStudent(student.id)
        : await archiveStudent(student.id);
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
      const result = await updateStudent(student.id, formData);
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
        Edit Profile
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit Student Profile"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <Alert>{error}</Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              name="first_name"
              label="First Name *"
              required
              defaultValue={student.first_name}
            />
            <Input
              name="last_name"
              label="Last Name *"
              required
              defaultValue={student.last_name}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              name="preferred_name"
              label="Preferred Name"
              defaultValue={student.preferred_name ?? ""}
            />
            {isArchived ? (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Status
                </label>
                <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                  Archived — restore the student below to change status.
                </p>
              </div>
            ) : (
              <Select
                name="status"
                label="Status"
                options={statusOptions}
                defaultValue={student.status}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              name="graduation_year"
              label="Graduation Year"
              options={yearOptions}
              defaultValue={String(student.graduation_year)}
            />
            <Select
              name="school_type"
              label="School Type"
              options={schoolTypeOptions}
              defaultValue={student.school_type ?? ""}
            />
          </div>

          <Input
            name="school_name"
            label="School Name"
            defaultValue={student.school_name ?? ""}
          />

          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Academics</h4>
            <div className="grid grid-cols-3 gap-4">
              <Input
                name="gpa_unweighted"
                label="GPA (Unweighted)"
                type="number"
                step="0.01"
                min="0"
                max="4.0"
                defaultValue={student.gpa_unweighted ?? ""}
              />
              <Input
                name="gpa_weighted"
                label="GPA (Weighted)"
                type="number"
                step="0.01"
                min="0"
                max="5.0"
                defaultValue={student.gpa_weighted ?? ""}
              />
              <Input
                name="class_rank"
                label="Class Rank"
                placeholder="e.g. 12/450"
                defaultValue={student.class_rank ?? ""}
              />
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Additional Info</h4>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Academic Interests
                </label>
                <textarea
                  name="academic_interests"
                  rows={2}
                  defaultValue={student.academic_interests ?? ""}
                  placeholder="e.g. Computer Science, Biology, Creative Writing"
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Extracurricular Summary
                </label>
                <textarea
                  name="extracurricular_summary"
                  rows={2}
                  defaultValue={student.extracurricular_summary ?? ""}
                  placeholder="Key activities, leadership roles, etc."
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>

          {canArchive && (
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-gray-900">
                    {isArchived ? "Restore student" : "Archive student"}
                  </h4>
                  <p className="text-xs text-gray-500">
                    {isArchived
                      ? "Return this student to the active roster."
                      : "Remove from the roster; find them later under the Archived filter."}
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
