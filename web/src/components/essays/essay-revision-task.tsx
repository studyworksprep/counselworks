"use client";
import { useId, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/modals/modal";
import { ActionForm, Hidden } from "@/components/interview/action-form";
import { createEssayRevisionTask } from "@/lib/actions/essay-drafting";
import { taskPath, type TaskSurface } from "@/lib/constants/task-links";
import { TASK_STATUS_LABELS } from "@/lib/constants/tasks";
import type { RevisionTask } from "@/lib/essays/drafting";
import type { EssayFeedbackRow } from "@/lib/db/queries";

export function EssayRevisionTask({
  feedback,
  task,
  canAssign,
  surface,
}: {
  feedback: EssayFeedbackRow;
  task?: RevisionTask;
  canAssign: boolean;
  surface: TaskSurface;
}) {
  const id = useId(),
    [open, setOpen] = useState(false),
    [dirty, setDirty] = useState(false),
    [pending, setPending] = useState(false),
    [discard, setDiscard] = useState(false);
  function close() {
    if (pending) return;
    if (dirty) setDiscard(true);
    else setOpen(false);
  }
  if (task && !open)
    return (
      <p className="mt-2 text-xs">
        <Link
          href={taskPath(task.id, surface)}
          className="font-medium text-primary-700 underline"
        >
          Open revision task
        </Link>
        <span className="ml-2 text-gray-500">
          {TASK_STATUS_LABELS[task.status] ?? task.status}
          {task.ownerPending ? " · Awaiting student account" : ""}
        </span>
      </p>
    );
  if ((!canAssign || !feedback.author_is_staff) && !open) return null;
  return (
    <>
      <Button
        className="mt-2"
        size="sm"
        variant="outline"
        onClick={() => {
          setDirty(false);
          setDiscard(false);
          setOpen(true);
        }}
      >
        Create revision task
      </Button>
      {open && (
        <Modal
          open
          trapFocus
          size="lg"
          onClose={close}
          title="Assign essay revision"
          description={`Connect revision work to this comment on version ${feedback.version_number}.`}
          footer={
            <>
              {discard && (
                <>
                  <p role="status" className="mr-auto text-sm text-warning-800">
                    Your revision instructions have not been saved.
                  </p>
                  <Button
                    variant="danger"
                    disabled={pending}
                    onClick={() => setOpen(false)}
                  >
                    Discard instructions
                  </Button>
                </>
              )}
              <Button variant="outline" disabled={pending} onClick={close}>
                Cancel
              </Button>
            </>
          }
        >
          <ActionForm
            action={createEssayRevisionTask}
            label="Assign revision task"
            onDirty={setDirty}
            onPendingChange={setPending}
            onSaved={() => setOpen(false)}
          >
            {task && (
              <p className="text-sm text-warning-800">
                A revision task now exists for this comment. Your instructions
                are still here; close this editor to open the existing task.
              </p>
            )}
            <Hidden name="feedback_id" value={feedback.id} />
            <p className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm">
              {feedback.body}
            </p>
            {feedback.quoted_text && (
              <blockquote className="whitespace-pre-wrap border-l-2 border-primary-200 pl-3 text-sm">
                {feedback.quoted_text}
              </blockquote>
            )}
            <Input
              id={`${id}-title`}
              name="title"
              label="Revision task title"
              required
              maxLength={200}
              defaultValue={`Revise the response using feedback on v${feedback.version_number}`}
            />
            <Textarea
              id={`${id}-instructions`}
              name="instructions"
              label="Revision instructions"
              required
              maxLength={6000}
              rows={4}
              defaultValue={feedback.body.slice(0, 6000)}
            />
            <Input
              id={`${id}-due`}
              name="due_on"
              label="Due date (optional)"
              type="date"
            />
            <p className="text-xs leading-5 text-gray-600">
              Assigned to this student’s account, visible to the student and
              counseling team. The original feedback and version stay attached.
              Completing the task does not resolve the comment or approve the
              essay; use the existing essay review process for that.
            </p>
          </ActionForm>
        </Modal>
      )}
    </>
  );
}
