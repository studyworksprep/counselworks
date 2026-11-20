import * as Glyphs from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * The icon vocabulary (design refresh): every icon in the app is chosen by
 * one of these names, so a verb or an area always draws the same glyph.
 * Names are plain strings, which lets server components hand them to client
 * components (Button, the header) as props.
 *
 * Rules of use:
 *   - An area's icon follows its destination: the sidebar item, the page
 *     header, and any button or link that goes there share it.
 *   - An action's icon follows its verb: every "Add …" shows `add`, every
 *     upload shows `upload`, and so on.
 *   - Icons support labels; they never replace them. Routine form controls
 *     (Save, Cancel, Close) stay text-only so the icons keep their weight.
 */
export const ICONS = {
  // Areas
  dashboard: Glyphs.DashboardIcon,
  students: Glyphs.StudentsIcon,
  families: Glyphs.FamiliesIcon,
  proposals: Glyphs.ProposalsIcon,
  caseload: Glyphs.CaseloadIcon,
  colleges: Glyphs.CollegeIcon,
  applications: Glyphs.ApplicationsIcon,
  readiness: Glyphs.ReadinessIcon,
  essays: Glyphs.EssaysIcon,
  essayPlanning: Glyphs.EssayPlanningIcon,
  interview: Glyphs.InterviewIcon,
  workflows: Glyphs.WorkflowsIcon,
  tasks: Glyphs.TasksIcon,
  messages: Glyphs.MessagesIcon,
  documents: Glyphs.DocumentsIcon,
  calendar: Glyphs.CalendarIcon,
  reports: Glyphs.ReportsIcon,
  settings: Glyphs.SettingsIcon,
  firm: Glyphs.FirmIcon,
  catalog: Glyphs.CatalogReviewIcon,
  billing: Glyphs.BillingIcon,
  profile: Glyphs.ProfileIcon,
  // An application's lifecycle workspaces
  finalReview: Glyphs.ApproveIcon,
  followThrough: Glyphs.StageUnderReviewIcon,
  decisions: Glyphs.StageDecisionIcon,

  // Actions
  add: Glyphs.PlusIcon,
  edit: Glyphs.PencilIcon,
  delete: Glyphs.TrashIcon,
  archive: Glyphs.ArchiveIcon,
  upload: Glyphs.UploadIcon,
  download: Glyphs.DownloadIcon,
  send: Glyphs.SendIcon,
  email: Glyphs.EnvelopeIcon,
  preview: Glyphs.EyeIcon,
  next: Glyphs.ArrowRightIcon,
  back: Glyphs.ArrowLeftIcon,
  external: Glyphs.ExternalLinkIcon,
  refresh: Glyphs.RefreshIcon,
  undo: Glyphs.UndoIcon,
  search: Glyphs.SearchIcon,
  filter: Glyphs.FilterIcon,
  adjust: Glyphs.AdjustIcon,
  print: Glyphs.PrintIcon,
  copy: Glyphs.CopyIcon,
  link: Glyphs.LinkIcon,
  assign: Glyphs.UserPlusIcon,
  sign: Glyphs.SignIcon,
  ai: Glyphs.SparklesIcon,
  schedule: Glyphs.CalendarPlusIcon,
  due: Glyphs.ClockIcon,
  approve: Glyphs.ApproveIcon,
  reject: Glyphs.XCircleIcon,
  check: Glyphs.CheckIcon,
  close: Glyphs.XMarkIcon,
  warning: Glyphs.ExclamationTriangleIcon,
  more: Glyphs.EllipsisIcon,

  // Application stages (STAGE_ICONS in components/applications/stage-icons.ts)
  stageNotStarted: Glyphs.StageNotStartedIcon,
  stageInProgress: Glyphs.StageInProgressIcon,
  stageSubmitted: Glyphs.SendIcon,
  stageUnderReview: Glyphs.StageUnderReviewIcon,
  stageDecision: Glyphs.StageDecisionIcon,
  stageWithdrawn: Glyphs.StageWithdrawnIcon,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const Glyph = ICONS[name];
  return <Glyph className={cn("h-5 w-5 shrink-0", className)} />;
}
