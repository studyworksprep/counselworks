"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import { useToast } from "@/components/ui/toast";
import {
  saveEssayPrompt,
  archiveEssayPrompt,
  bulkCreateEssaysFromPrompts,
} from "@/lib/actions/essay-prompts";
import type { EssayPromptRow } from "@/lib/db/queries";

/**
 * Supplement prompt bank (fix plan 10.3): curate prompts (optionally tied
 * to a college) and bulk-create shared drafts for a student.
 */
export function PromptBankModal({
  open,
  onClose,
  prompts,
  students,
  colleges,
}: {
  open: boolean;
  onClose: () => void;
  prompts: EssayPromptRow[];
  students: { id: string; name: string }[];
  colleges: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<"list" | "edit">("list");
  const [editing, setEditing] = useState<EssayPromptRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [studentId, setStudentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await saveEssayPrompt(formData);
      if (result.error) setError(result.error);
      else {
        setMode("list");
        setEditing(null);
        router.refresh();
      }
    });
  }

  function handleArchive(id: string) {
    startTransition(async () => {
      await archiveEssayPrompt(id);
      router.refresh();
    });
  }

  function handleBulkCreate() {
    setError(null);
    if (!studentId) {
      setError("Choose a student to create drafts for");
      return;
    }
    startTransition(async () => {
      const result = await bulkCreateEssaysFromPrompts(studentId, [
        ...selected,
      ]);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      toast(
        `Created ${"created" in result ? result.created : 0} essay draft(s)`
      );
      setSelected(new Set());
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => !isPending && onClose()}
      title="Supplement prompt bank"
      description="Curate prompts once; instantiate them as shared drafts per student."
      size="lg"
    >
      {mode === "edit" ? (
        <form onSubmit={handleSave} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          {editing?.id && (
            <input type="hidden" name="prompt_id" value={editing.id} />
          )}
          <Input
            name="title"
            label="Title"
            required
            defaultValue={editing?.title ?? ""}
            placeholder='e.g. "Why Us?" — 250 words'
          />
          <Textarea
            name="prompt_text"
            label="Prompt"
            required
            rows={4}
            defaultValue={editing?.prompt_text ?? ""}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              name="college_id"
              label="College (optional)"
              placeholder="General prompt"
              defaultValue={editing?.college_id ?? ""}
              options={colleges.map((c) => ({ value: c.id, label: c.name }))}
            />
            <Input
              name="word_limit"
              label="Word limit"
              type="number"
              defaultValue={editing?.word_limit ?? ""}
              placeholder="e.g. 250"
            />
          </div>
          <div className="flex gap-3">
            <Button type="submit" loading={isPending}>
              Save prompt
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMode("list");
                setEditing(null);
              }}
            >
              Back
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          {error && <Alert>{error}</Alert>}

          {prompts.length === 0 ? (
            <p className="text-sm text-gray-500">
              No prompts yet — add the supplements you assign every season.
            </p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {prompts.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start gap-2 rounded-lg border border-gray-200 px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    aria-label={`Select ${p.title}`}
                    className="mt-1 h-4 w-4 rounded border-gray-300"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {p.title}
                      {p.college_name && (
                        <span className="ml-1 text-xs font-normal text-gray-400">
                          · {p.college_name}
                        </span>
                      )}
                      {p.word_limit && (
                        <span className="ml-1 text-xs font-normal text-gray-400">
                          · {p.word_limit} words
                        </span>
                      )}
                    </p>
                    <p className="line-clamp-2 text-xs text-gray-500">
                      {p.prompt_text}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(p);
                      setMode("edit");
                    }}
                    className="text-xs text-gray-400 hover:text-gray-700"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleArchive(p.id)}
                    disabled={isPending}
                    className="text-xs text-gray-400 hover:text-danger-600"
                  >
                    Archive
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-3 border-t border-gray-100 pt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(null);
                setMode("edit");
              }}
            >
              New prompt
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Select
                placeholder="Create for student…"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                options={students.map((s) => ({ value: s.id, label: s.name }))}
                className="w-48"
              />
              <Button
                size="sm"
                onClick={handleBulkCreate}
                disabled={selected.size === 0}
                loading={isPending}
              >
                Create {selected.size > 0 ? `${selected.size} ` : ""}draft
                {selected.size === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
