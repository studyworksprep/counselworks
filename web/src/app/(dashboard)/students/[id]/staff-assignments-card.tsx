"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useState,
  useTransition,
} from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
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
  // Stable identity: the modal closes itself in an effect keyed on the
  // action state, so an unstable onClose would re-close a reopened modal.
  const closeAdd = useCallback(() => setShowAdd(false), []);

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
        onClose={closeAdd}
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
  const confirmDialog = useConfirm();
  // Dispatched through useActionState so the framework owns the action
  // lifecycle and applies the revalidated page itself. The hand-rolled
  // `startTransition(async …)` + router.refresh() shape intermittently
  // dropped the revalidated payload (stale page until hard reload).
  const [removeState, removeAction, isPending] = useActionState(
    async (): Promise<{ error?: string; success?: boolean }> => {
      const result = await removeStaffAssignment(assignment.id);
      return "error" in result && result.error
        ? { error: result.error }
        : { success: true };
    },
    null,
  );
  const [, startTransition] = useTransition();
  const user = assignment.users;

  async function handleRemove() {
    if (!(await confirmDialog({ title: "Remove this assignment?", destructive: true, confirmLabel: "Remove" }))) return;
    startTransition(() => removeAction());
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
        {removeState?.error && (
          <p className="text-xs text-danger-600">{removeState.error}</p>
        )}
      </div>
      {canManage && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={isPending}
          className="text-xs text-gray-500 hover:text-danger-600"
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
  // Framework-managed submission (React 19 form action): the action's
  // revalidatePath payload is applied by the router itself, so no manual
  // router.refresh() and no post-await state juggling. The previous
  // `startTransition(async …)` shape intermittently lost the revalidated
  // payload and left the page stale until a hard reload.
  const [state, formAction, isPending] = useActionState(
    async (
      _prev: { error?: string; success?: boolean } | null,
      formData: FormData,
    ) => {
      formData.set("student_id", studentId);
      const result = await assignStaffToStudent(formData);
      return "error" in result && result.error
        ? { error: result.error }
        : { success: true };
    },
    null,
  );

  // Close only on success — an error keeps the modal open with the Alert,
  // which the golden-path E2E relies on as its success signal. Fires once
  // per submission (state identity changes per action; onClose is stable).
  // Deferred so the close never sets state synchronously in-effect (repo
  // lint convention).
  useEffect(() => {
    if (!state || state.error) return;
    const t = setTimeout(onClose, 0);
    return () => clearTimeout(t);
  }, [state, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Assign staff">
      <form action={formAction} className="space-y-4">
        {state?.error && (
          <Alert>{state.error}</Alert>
        )}
        <Select
          name="user_id"
          label="Staff member"
          required
          placeholder="Select someone"
          options={staff.map((s) => ({ value: s.id, label: s.name }))}
        />
        <Select
          name="assignment_type"
          label="Role"
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
