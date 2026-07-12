"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import { formatDate } from "@/lib/utils";
import { createNote, archiveNote } from "@/lib/actions/notes";

export interface NoteItem {
  id: string;
  title: string | null;
  body: string;
  note_type: string;
  visibility_scope: string;
  created_at: string;
}

/**
 * Staff-side notes list with creation and archive. Used on the student and
 * family detail pages; exactly one of studentId/familyId is set.
 */
export function NotesCard({
  notes,
  studentId,
  familyId,
}: {
  notes: NoteItem[];
  studentId?: string;
  familyId?: string;
}) {
  const confirmDialog = useConfirm();
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    if (studentId) formData.set("student_id", studentId);
    if (familyId) formData.set("family_id", familyId);
    startTransition(async () => {
      const result = await createNote(formData);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setShowModal(false);
      router.refresh();
    });
  }

  async function handleArchive(noteId: string) {
    if (!(await confirmDialog({ title: "Archive this note?", destructive: true, confirmLabel: "Archive" }))) return;
    startTransition(async () => {
      await archiveNote(noteId);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Notes</h3>
          <Button size="sm" variant="outline" onClick={() => setShowModal(true)}>
            Add Note
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {notes.length === 0 ? (
          <p className="text-sm text-gray-500">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((note) => (
              <li
                key={note.id}
                className="border-b border-gray-100 pb-3 last:border-0"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {note.title && (
                      <p className="text-sm font-medium text-gray-900">
                        {note.title}
                      </p>
                    )}
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">
                      {note.body}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      {formatDate(note.created_at)}
                      <Badge
                        variant={
                          note.visibility_scope === "family"
                            ? "primary"
                            : "default"
                        }
                        className="ml-2"
                      >
                        {note.visibility_scope === "family"
                          ? "Shared with family"
                          : "Staff only"}
                      </Badge>
                    </p>
                  </div>
                  <button
                    onClick={() => handleArchive(note.id)}
                    disabled={isPending}
                    className="shrink-0 text-xs text-gray-400 hover:text-danger-600"
                  >
                    Archive
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Modal
        open={showModal}
        onClose={() => !isPending && setShowModal(false)}
        title="Add Note"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert>{error}</Alert>
          )}
          <Input name="title" label="Title" placeholder="Optional" />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Note *
            </label>
            <textarea
              name="body"
              required
              rows={4}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <Select
            name="visibility_scope"
            label="Visible to"
            options={[
              { value: "staff", label: "Staff only" },
              { value: "family", label: "Shared with student & family" },
            ]}
          />
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Note"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowModal(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
