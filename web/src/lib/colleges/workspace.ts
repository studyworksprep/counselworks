import type { TaskSurface } from "../constants/task-links";
import type { CollegePromptSetRow } from "../db/queries";

export function collegeWorkspacePath(id: string, studentId: string, surface: TaskSurface) {
  return surface === "staff"
    ? `/students/${studentId}/colleges/${id}`
    : `/${surface}-colleges/${id}`;
}

export interface LibraryPromptSnapshot {
  entry_year: number;
  source_url: string;
  verified_on: string | null;
  requirement: "required" | "optional" | "conditional";
  text_kind: "summary" | "verbatim";
  word_limit: number | null;
  character_limit: number | null;
}

export const PROMPT_COVERAGE_LABELS = {
  verified: "Verified requirements",
  no_supplement: "No general supplement",
  needs_review: "Awaiting verification — no automatic assignments",
};

export interface CollegeWorkspaceData {
  surface: TaskSurface;
  canManage: boolean;
  student: { id: string; first_name: string; last_name: string; graduation_year: number };
  college: { id: string; name: string; website_url: string | null; city: string | null; state_region: string | null };
  list: { id: string; category: string; round_type: string | null; intended_major: string | null; status: string;
    interview_status: string | null; interview_at: string | null; engagement_log_json: unknown };
  application: { id: string; stage: string; application_type: string; deadline_at: string | null;
    deadline_source: string; submitted_at: string | null; decision_result: string | null; checklist_json: unknown } | null;
  promptSet: CollegePromptSetRow | null;
  essays: { id: string; title: string | null; status: string; visibility_scope: string;
    library_prompt_id: string | null; current_version_number: number; updated_at: string }[];
  tasks: { id: string; title: string; status: string; owner_role: string | null; due_at: string | null; due_on: string | null }[];
}
