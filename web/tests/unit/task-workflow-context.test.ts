import { describe, expect, it } from "vitest";
import { shapeWorkflowRow } from "@/lib/db/queries";
import { taskPath } from "@/lib/constants/task-links";
type Row = Parameters<typeof shapeWorkflowRow>[0];
const step = (id: string, scope: string, status: string, owner: string, depends: string | null): Row["student_workflow_steps"][number] => ({
  id, template_step_id: `template-${id}`, title: `${id} title`, description: `${id} instructions`, status,
  step_order: id === "private" ? 0 : 1, due_date: null, assigned_user_id: owner,
  assignee: { first_name: owner, last_name: "Person" }, linked_task: status === "blocked" ? null : { id: `task-${id}`, owner_pending: false },
  workflow_template_steps: { name: id, description: null, step_order: 1, depends_on_step_id: depends, visibility_scope: scope },
});
const workflow = (steps: Row["student_workflow_steps"]): Row => ({ id: "plan", name: "Plan", description: null, status: "in_progress", due_date: null, workflow_template_id: "template", workflow_templates: null, student_workflow_steps: steps });
describe("workflow task context", () => {
  it("explains blocked work without leaking the hidden prerequisite or private instructions", () => {
    const result = shapeWorkflowRow(workflow([step("private", "staff", "pending", "counselor", null), step("essay", "student", "blocked", "student", "template-private")]), ["student", "family"], "student");
    expect(result.visible_steps).toHaveLength(1);
    expect(result.visible_steps[0].waiting_reason).toBe("Waiting for your counseling team to finish a prerequisite.");
    expect(result.visible_steps[0].task_id).toBeNull();
    expect(JSON.stringify(result)).not.toContain("private title");
    expect(JSON.stringify(result)).not.toContain("private instructions");
  });
  it("keeps personal progress separate and uses the same task identity", () => {
    const result = shapeWorkflowRow(workflow([step("kickoff", "student", "completed", "counselor", null), step("essay", "student", "pending", "student", null)]), ["student"], "student");
    expect(result.completed_steps).toBe(1);
    expect(result.my_completed_steps).toBe(0);
    expect(result.my_total_steps).toBe(1);
    expect(taskPath(result.visible_steps[1].task_id!)).toBe("/task/task-essay");
  });
  it("never links an unpublished task even when the step itself is visible", () => {
    const pending = step("essay", "student", "pending", "student", null);
    pending.linked_task = { id: "unpublished", owner_pending: true };
    expect(shapeWorkflowRow(workflow([pending]), ["student"], "student").visible_steps[0].task_id).toBeNull();
  });
});
