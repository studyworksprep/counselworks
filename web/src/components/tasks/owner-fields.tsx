"use client";
import { useEffect, useState, useId } from "react";
import { Select } from "@/components/ui/select";
import { getTaskOwnerChoices } from "@/lib/actions/tasks";
import type { OwnerChoice } from "@/lib/auth/task-owner";

export function TaskOwnerFields({ students, defaultStudentId = "", defaultUserId = "", defaultRole = "student" }: {
  students: { id: string; name: string }[]; defaultStudentId?: string; defaultUserId?: string; defaultRole?: string;
}) {
  const fieldId = useId();
  const [studentId, setStudentId] = useState(defaultStudentId);
  const [choices, setChoices] = useState<OwnerChoice[]>([]);
  const [owner, setOwner] = useState(defaultUserId || (defaultStudentId ? defaultRole : "counselor"));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    getTaskOwnerChoices(studentId || null).then(result => {
      if (!current) return;
      setChoices(result.choices);
      setError(result.error ?? null);
    });
    return () => { current = false; };
  }, [studentId]);
  const selected = choices.find(c => c.id === owner);
  return <>
    <Select id={`${fieldId}-student`} name="student_id" label="Related Student" placeholder="None" value={studentId}
      onChange={e => { setStudentId(e.target.value); setOwner("student"); }}
      options={students.map(s => ({ value: s.id, label: s.name }))} />
    <input type="hidden" name="owner_role" value={selected?.role ?? owner} />
    <input type="hidden" name="assigned_user_id" value={selected && selected.id !== "student" ? selected.id : ""} />
    <Select id={`${fieldId}-owner`} label="Assign To" value={owner} onChange={e => setOwner(e.target.value)} options={[
      ...(studentId ? [{ value: "student", label: "Student — linked student account" }] : [{ value: "counselor", label: "Assigned counselor" }]),
      ...choices.filter(c => c.id !== "student").map(c => ({ value: c.id, label: `${c.role === "student" ? "Student" : c.role === "parent_guardian" ? "Parent" : "Staff"}: ${c.name}${c.ready ? "" : " (portal access pending)"}` })),
    ]} />
    {error && <p role="alert">{error}</p>}
    {studentId && <p className="text-xs text-gray-500">Missing portal access? The task will be saved awaiting an owner and will not be published. <a className="underline" href={`/students/${studentId}`}>Open student workspace to invite</a>. Invitations are sent only when you choose to send one.</p>}
  </>;
}
