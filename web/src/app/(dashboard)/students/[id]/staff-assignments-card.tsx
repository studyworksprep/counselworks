"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/modals/modal";
import {
  assignStaffToStudent,
  removeStaffAssignment,
} from "@/lib/actions/assignments";

interface AssignmentRow {
  id: string;
  assignment_type: string;
  is_primary: boolean;
  users: { first_name: string; last_name: string } | null;
}

interface StaffOption {
  id: string;
  name: string;
}

interface Props {
  studentId: string;
  assignments: AssignmentRow[];
  staff: StaffOption[];
  canManage: boolean;
}

const ASSIGNMENT_TYPE_OPTIONS = [
  { value: "counselor", label: "Counselor" },
  { value: "essay_coach", label: "Essay coach" },
  { value: "tutor", label: "Tutor" },
  { value: "read_only_staff", label: "Read-only staff" },
];

function formatType(t: string): string {
  return ASSIGNMENT_TYPE_OPTIONS.find((o) => o.value === t)?.label ??
    t.replace(/_/g, " ");
}

export function StaffAssignmentsCard({
  studentId,
  assignments,
  staff,
  canManage,
}: Props) {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Staff Assignments</h3>
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
              Assign
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {assignments.length === 0 ? (
          <p className="text-sm text-gray-500">
            No staff assigned.
            {canManage && (
              <>
                {" "}
                <button
                  type="button"
                  className="text-primary-600 hover:underline"
                  onClick={() => setShowAdd(true)}
                >
                  Assign someone
                </button>
                .
              </>
            )}
          </p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => (
              <AssignmentRowItem
                key={a.id}
                assignment={a}
                canManage={canManage}
              />
            ))}
          </ul>
        )}
      </CardContent>

      <AddAssignmentModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        studentId={studentId}
        staff={staff}
      />
    </Card>
  );
}

function AssignmentRowItem({
  assignment,
  canManage,
}: {
  assignment: AssignmentRow;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const user = assignment.users;

  function handleRemove() {
    if (!confirm("Remove this assignment?")) return;
    startTransition(async () => {
      const result = await removeStaffAssignment(assignment.id);
      if (!result.error) router.refresh();
    });
  }

  return (
    <li className="flex items-center gap-2">
      <Avatar
        firstName={user?.first_name ?? ""}
        lastName={user?.last_name ?? ""}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">
          {user ? `${user.first_name} ${user.last_name}` : "Unknown"}
        </p>
        <p className="text-xs text-gray-500 capitalize">
          {formatType(assignment.assignment_type)}
          {assignment.is_primary && " (Primary)"}
        </p>
      </div>
      {canManage && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={isPending}
          className="text-xs text-gray-400 hover:text-red-600"
        >
          Remove
        </button>
      )}
    </li>
  );
}

function AddAssignmentModal({
  open,
  onClose,
  studentId,
  staff,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  staff: StaffOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("student_id", studentId);
    startTransition(async () => {
      const result = await assignStaffToStudent(formData);
      if (result.error) setError(result.error);
      else {
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Assign staff">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <Select
          name="user_id"
          label="Staff member *"
          required
          placeholder="Select someone"
          options={staff.map((s) => ({ value: s.id, label: s.name }))}
        />
        <Select
          name="assignment_type"
          label="Role *"
          required
          defaultValue="counselor"
          options={ASSIGNMENT_TYPE_OPTIONS}
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            name="is_primary"
            value="true"
            className="h-4 w-4 rounded border-gray-300"
          />
          Primary for this role
        </label>
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isPending || staff.length === 0}>
            {isPending ? "Assigning..." : "Assign"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
