"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PageShell } from "@/components/layout/page-shell";
import { useToast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/modals/modal";
import { EmptyState } from "@/components/ui/empty-state";
import {
  addStudentCollege,
  updateStudentCollege,
  removeStudentCollege,
  reorderStudentColleges,
} from "@/lib/actions/colleges";
import { applyWorkflowToStudent } from "@/lib/actions/workflows";
import { createApplicationFromList } from "@/lib/actions/applications";
import { EngagementModal } from "@/components/colleges/engagement-modal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface College {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state_region: string | null;
  website_url: string | null;
  acceptance_rate: number | null;
  sat_avg: number | null;
  act_avg: number | null;
  undergraduate_size: number | null;
  tuition_in_state: number | null;
  tuition_out_state: number | null;
  net_price_avg: number | null;
  graduation_rate: number | null;
  retention_rate: number | null;
  earnings_median_10yr: number | null;
  median_debt: number | null;
  federal_loan_rate: number | null;
  institution_type: string | null;
  locale_type: string | null;
  scorecard_synced_at: string | null;
  usnews_national_rank: number | null;
  usnews_liberal_arts_rank: number | null;
  usnews_business_rank: number | null;
}

interface ApplicationRow {
  id: string;
  stage: string;
  application_type: string;
  deadline_at: string | null;
  submitted_at: string | null;
  decision_result: string | null;
}

interface StudentCollegeRow {
  id: string;
  category: string;
  round_type: string | null;
  intended_major: string | null;
  status: string;
  interest_level: number | null;
  counselor_fit_rating: number | null;
  notes: string | null;
  sort_order: number;
  interview_status: string | null;
  interview_at: string | null;
  engagement_log_json: unknown;
  colleges: College | null;
  application: ApplicationRow | null;
}

interface PerCollegeTemplate {
  id: string;
  name: string;
  description: string | null;
  step_count: number;
}

interface Props {
  studentId: string;
  studentName: string;
  graduationYear: number;
  collegeList: StudentCollegeRow[];
  allColleges: { id: string; name: string }[];
  perCollegeTemplates: PerCollegeTemplate[];
}

/**
 * Category counts + balance nudge (fix plan 4.5): flags lists that are all
 * reaches with no likely admits.
 */
function ListBalanceSummary({ list }: { list: StudentCollegeRow[] }) {
  const counts: Record<string, number> = {};
  for (const row of list) {
    counts[row.category] = (counts[row.category] ?? 0) + 1;
  }
  const reaches = (counts.reach ?? 0) + (counts.far_reach ?? 0);
  const safeties = (counts.safety ?? 0) + (counts.likely ?? 0);
  const unbalanced =
    (reaches > 0 && safeties === 0) || (list.length >= 8 && safeties < 2);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {CATEGORIES.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700"
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: c.color }}
          />
          {c.label}: {counts[c.key] ?? 0}
        </span>
      ))}
      {unbalanced && (
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
          ⚠ Top-heavy list — add likely/safety schools to balance the reaches
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CATEGORIES = [
  { key: "safety", label: "Safety", color: "#16a34a" },
  { key: "likely", label: "Likely", color: "#10b981" },
  { key: "target", label: "Target", color: "#3b82f6" },
  { key: "reach", label: "Reach", color: "#f59e0b" },
  { key: "far_reach", label: "Far Reach", color: "#dc2626" },
];

const CATEGORY_COLOR: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.color]),
);
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label]),
);

const ROUND_OPTIONS = [
  { value: "ea", label: "Early Action" },
  { value: "ed", label: "Early Decision" },
  { value: "ed2", label: "ED II" },
  { value: "rea", label: "REA" },
  { value: "rd", label: "Regular Decision" },
  { value: "rolling", label: "Rolling" },
];

const STATUS_OPTIONS = [
  { value: "researching", label: "Researching" },
  { value: "considering", label: "Considering" },
  { value: "applying", label: "Applying" },
  { value: "applied", label: "Applied" },
  { value: "removed", label: "Removed" },
];

const APPLICATION_STAGE_VARIANT: Record<
  string,
  "default" | "primary" | "warning" | "success" | "danger"
> = {
  not_started: "default",
  in_progress: "primary",
  submitted: "primary",
  decision_received: "success",
  withdrawn: "default",
};

const DECISION_RESULT_VARIANT: Record<
  string,
  "default" | "primary" | "warning" | "success" | "danger"
> = {
  accepted: "success",
  rejected: "danger",
  waitlisted: "warning",
  deferred: "warning",
};

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------
function pct(v: number | null) {
  return v == null ? "—" : `${(v * 100).toFixed(0)}%`;
}
function usd(v: number | null) {
  return v == null ? "—" : `$${v.toLocaleString()}`;
}
function num(v: number | null) {
  return v == null ? "—" : v.toLocaleString();
}

// ---------------------------------------------------------------------------
// Column config
// ---------------------------------------------------------------------------
type SortValue = string | number | null;

interface ColumnDef {
  key: string;
  header: string;
  group: string;
  align?: "left" | "right";
  /** Value used both for sorting and rendering. */
  value: (row: StudentCollegeRow) => SortValue;
  /** Optional custom renderer. Falls back to formatted value. */
  render?: (row: StudentCollegeRow) => React.ReactNode;
}

const ALL_COLUMNS: ColumnDef[] = [
  {
    key: "college_name",
    header: "College",
    group: "Core",
    value: (r) => r.colleges?.name ?? null,
    render: (r) => (
      <Link
        href={`/college-planning/${r.colleges?.id ?? ""}`}
        className="font-medium text-gray-900 hover:text-primary-600"
      >
        {r.colleges?.name ?? "—"}
      </Link>
    ),
  },
  {
    key: "category",
    header: "Category",
    group: "Core",
    value: (r) => r.category,
    render: (r) => (
      <span className="inline-flex items-center gap-1.5 text-xs text-gray-700">
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: CATEGORY_COLOR[r.category] ?? "#9ca3af" }}
        />
        {CATEGORY_LABEL[r.category] ?? r.category}
      </span>
    ),
  },
  {
    key: "round_type",
    header: "Round",
    group: "Core",
    value: (r) => r.round_type,
    render: (r) =>
      r.round_type ? (
        <span className="text-xs uppercase text-gray-700">{r.round_type}</span>
      ) : (
        <span className="text-xs text-gray-400">—</span>
      ),
  },
  {
    key: "intended_major",
    header: "Major",
    group: "Core",
    value: (r) => r.intended_major,
    render: (r) => (
      <span className="text-xs text-gray-700">{r.intended_major ?? "—"}</span>
    ),
  },
  {
    key: "status",
    header: "Status",
    group: "Core",
    value: (r) => r.status,
    render: (r) => (
      <span className="text-xs text-gray-700 capitalize">
        {r.status.replace(/_/g, " ")}
      </span>
    ),
  },
  {
    key: "application",
    header: "Application",
    group: "Core",
    value: (r) => r.application?.decision_result ?? r.application?.stage ?? null,
    render: (r) =>
      r.application ? (
        // Decision outcome outranks the stage badge (fix plan 8.8), and the
        // badge deep-links to the application record (8.6).
        <Link
          href={`/applications/${r.application.id}`}
          onClick={(e) => e.stopPropagation()}
        >
          {r.application.decision_result ? (
            <Badge
              variant={
                DECISION_RESULT_VARIANT[r.application.decision_result] ??
                "default"
              }
            >
              {r.application.decision_result}
            </Badge>
          ) : (
            <Badge
              variant={
                APPLICATION_STAGE_VARIANT[r.application.stage] ?? "default"
              }
            >
              {r.application.stage.replace(/_/g, " ")}
            </Badge>
          )}
        </Link>
      ) : (
        <span className="text-xs text-gray-400">—</span>
      ),
  },
  {
    key: "deadline_at",
    header: "Deadline",
    group: "Core",
    value: (r) => r.application?.deadline_at ?? null,
    render: (r) => (
      <span className="text-xs text-gray-700">
        {r.application?.deadline_at
          ? new Date(r.application.deadline_at).toLocaleDateString()
          : "—"}
      </span>
    ),
  },
  {
    key: "city_state",
    header: "Location",
    group: "School Info",
    value: (r) =>
      [r.colleges?.city, r.colleges?.state_region].filter(Boolean).join(", ") || null,
    render: (r) => (
      <span className="text-xs text-gray-600">
        {[r.colleges?.city, r.colleges?.state_region].filter(Boolean).join(", ") ||
          "—"}
      </span>
    ),
  },
  {
    key: "institution_type",
    header: "Type",
    group: "School Info",
    value: (r) => r.colleges?.institution_type ?? null,
    render: (r) => (
      <span className="text-xs text-gray-600">
        {r.colleges?.institution_type ?? "—"}
      </span>
    ),
  },
  {
    key: "locale_type",
    header: "Setting",
    group: "School Info",
    value: (r) => r.colleges?.locale_type ?? null,
    render: (r) => (
      <span className="text-xs text-gray-600">{r.colleges?.locale_type ?? "—"}</span>
    ),
  },
  {
    key: "undergraduate_size",
    header: "Enrollment",
    group: "School Info",
    align: "right",
    value: (r) => r.colleges?.undergraduate_size ?? null,
    render: (r) => (
      <span className="text-xs text-gray-700">{num(r.colleges?.undergraduate_size ?? null)}</span>
    ),
  },
  {
    key: "usnews_national_rank",
    header: "US News (Nat'l)",
    group: "Rankings",
    align: "right",
    value: (r) => r.colleges?.usnews_national_rank ?? null,
    render: (r) => (
      <span className="text-xs text-gray-700">
        {r.colleges?.usnews_national_rank
          ? `#${r.colleges.usnews_national_rank}`
          : "—"}
      </span>
    ),
  },
  {
    key: "usnews_liberal_arts_rank",
    header: "US News (LAC)",
    group: "Rankings",
    align: "right",
    value: (r) => r.colleges?.usnews_liberal_arts_rank ?? null,
    render: (r) => (
      <span className="text-xs text-gray-700">
        {r.colleges?.usnews_liberal_arts_rank
          ? `#${r.colleges.usnews_liberal_arts_rank}`
          : "—"}
      </span>
    ),
  },
  {
    key: "usnews_business_rank",
    header: "US News (Bus.)",
    group: "Rankings",
    align: "right",
    value: (r) => r.colleges?.usnews_business_rank ?? null,
    render: (r) => (
      <span className="text-xs text-gray-700">
        {r.colleges?.usnews_business_rank
          ? `#${r.colleges.usnews_business_rank}`
          : "—"}
      </span>
    ),
  },
  {
    key: "acceptance_rate",
    header: "Accept Rate",
    group: "Admissions",
    align: "right",
    value: (r) => r.colleges?.acceptance_rate ?? null,
    render: (r) => <span className="text-xs text-gray-700">{pct(r.colleges?.acceptance_rate ?? null)}</span>,
  },
  {
    key: "sat_avg",
    header: "SAT Avg",
    group: "Admissions",
    align: "right",
    value: (r) => r.colleges?.sat_avg ?? null,
    render: (r) => <span className="text-xs text-gray-700">{r.colleges?.sat_avg ?? "—"}</span>,
  },
  {
    key: "act_avg",
    header: "ACT Avg",
    group: "Admissions",
    align: "right",
    value: (r) => r.colleges?.act_avg ?? null,
    render: (r) => <span className="text-xs text-gray-700">{r.colleges?.act_avg ?? "—"}</span>,
  },
  {
    key: "tuition_in_state",
    header: "Tuition (In)",
    group: "Cost",
    align: "right",
    value: (r) => r.colleges?.tuition_in_state ?? null,
    render: (r) => <span className="text-xs text-gray-700">{usd(r.colleges?.tuition_in_state ?? null)}</span>,
  },
  {
    key: "tuition_out_state",
    header: "Tuition (OOS)",
    group: "Cost",
    align: "right",
    value: (r) => r.colleges?.tuition_out_state ?? null,
    render: (r) => <span className="text-xs text-gray-700">{usd(r.colleges?.tuition_out_state ?? null)}</span>,
  },
  {
    key: "net_price_avg",
    header: "Net Price",
    group: "Cost",
    align: "right",
    value: (r) => r.colleges?.net_price_avg ?? null,
    render: (r) => <span className="text-xs text-gray-700">{usd(r.colleges?.net_price_avg ?? null)}</span>,
  },
  {
    key: "median_debt",
    header: "Median Debt",
    group: "Cost",
    align: "right",
    value: (r) => r.colleges?.median_debt ?? null,
    render: (r) => <span className="text-xs text-gray-700">{usd(r.colleges?.median_debt ?? null)}</span>,
  },
  {
    key: "federal_loan_rate",
    header: "Loan Rate",
    group: "Cost",
    align: "right",
    value: (r) => r.colleges?.federal_loan_rate ?? null,
    render: (r) => <span className="text-xs text-gray-700">{pct(r.colleges?.federal_loan_rate ?? null)}</span>,
  },
  {
    key: "graduation_rate",
    header: "Grad Rate",
    group: "Outcomes",
    align: "right",
    value: (r) => r.colleges?.graduation_rate ?? null,
    render: (r) => <span className="text-xs text-gray-700">{pct(r.colleges?.graduation_rate ?? null)}</span>,
  },
  {
    key: "retention_rate",
    header: "Retention",
    group: "Outcomes",
    align: "right",
    value: (r) => r.colleges?.retention_rate ?? null,
    render: (r) => <span className="text-xs text-gray-700">{pct(r.colleges?.retention_rate ?? null)}</span>,
  },
  {
    key: "earnings_median_10yr",
    header: "10yr Earnings",
    group: "Outcomes",
    align: "right",
    value: (r) => r.colleges?.earnings_median_10yr ?? null,
    render: (r) => <span className="text-xs text-gray-700">{usd(r.colleges?.earnings_median_10yr ?? null)}</span>,
  },
  {
    key: "interest_level",
    header: "Student Interest",
    group: "Notes",
    align: "right",
    value: (r) => r.interest_level,
    render: (r) => (
      <span className="text-xs text-gray-700">
        {r.interest_level ? `${r.interest_level}/5` : "—"}
      </span>
    ),
  },
  {
    key: "counselor_fit_rating",
    header: "Counselor Fit",
    group: "Notes",
    align: "right",
    value: (r) => r.counselor_fit_rating,
    render: (r) => (
      <span className="text-xs text-gray-700">
        {r.counselor_fit_rating ? `${r.counselor_fit_rating}/5` : "—"}
      </span>
    ),
  },
  {
    key: "notes",
    header: "Notes",
    group: "Notes",
    value: (r) => r.notes,
    render: (r) => (
      <span className="text-xs text-gray-600 line-clamp-2">{r.notes ?? "—"}</span>
    ),
  },
];

const DEFAULT_VISIBLE_COLUMNS = [
  "college_name",
  "category",
  "round_type",
  "intended_major",
  "status",
  "application",
  "deadline_at",
  "acceptance_rate",
  "sat_avg",
];

const STORAGE_KEY = "counselworks:student-colleges:columns";

// Column visibility is persisted in localStorage, exposed as an external
// store so server render and hydration both see the default snapshot.
const columnPrefsListeners = new Set<() => void>();

function subscribeToColumnPrefs(listener: () => void) {
  columnPrefsListeners.add(listener);
  return () => {
    columnPrefsListeners.delete(listener);
  };
}

function getColumnPrefsSnapshot(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function getColumnPrefsServerSnapshot(): string | null {
  return null;
}

function saveVisibleColumns(keys: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {}
  columnPrefsListeners.forEach((listener) => listener());
}

// ---------------------------------------------------------------------------
// Sortable row
// ---------------------------------------------------------------------------
function SortableRow({
  row,
  visibleColumns,
  canDrag,
  onEdit,
  onRemove,
  onAddWorkflow,
  onCreateApplication,
  onEngagement,
  hasPerCollegeTemplates,
  isCreatingApp,
}: {
  row: StudentCollegeRow;
  visibleColumns: ColumnDef[];
  canDrag: boolean;
  onEdit: (row: StudentCollegeRow) => void;
  onRemove: (row: StudentCollegeRow) => void;
  onAddWorkflow: (row: StudentCollegeRow) => void;
  onCreateApplication: (row: StudentCollegeRow) => void;
  onEngagement: (row: StudentCollegeRow) => void;
  hasPerCollegeTemplates: boolean;
  isCreatingApp: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id, disabled: !canDrag });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="border-b border-gray-100 hover:bg-gray-50"
    >
      <td className="w-8 px-2 py-2 align-middle">
        <button
          type="button"
          aria-label={canDrag ? "Drag to reorder" : "Switch to manual sort to drag"}
          title={canDrag ? "Drag to reorder" : "Switch to manual sort to drag"}
          className={`touch-none ${
            canDrag
              ? "cursor-grab text-gray-400 hover:text-gray-600"
              : "cursor-not-allowed text-gray-200"
          }`}
          {...(canDrag ? attributes : {})}
          {...(canDrag ? listeners : {})}
          disabled={!canDrag}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="3" r="1.5" />
            <circle cx="11" cy="3" r="1.5" />
            <circle cx="5" cy="8" r="1.5" />
            <circle cx="11" cy="8" r="1.5" />
            <circle cx="5" cy="13" r="1.5" />
            <circle cx="11" cy="13" r="1.5" />
          </svg>
        </button>
      </td>
      {visibleColumns.map((col) => (
        <td
          key={col.key}
          className={`px-3 py-2 align-middle ${
            col.align === "right" ? "text-right" : ""
          }`}
        >
          {col.render ? col.render(row) : String(col.value(row) ?? "—")}
        </td>
      ))}
      <td className="w-32 px-2 py-2 align-middle text-right">
        <RowActions
          row={row}
          onEdit={onEdit}
          onRemove={onRemove}
          onAddWorkflow={onAddWorkflow}
          onCreateApplication={onCreateApplication}
          onEngagement={onEngagement}
          hasPerCollegeTemplates={hasPerCollegeTemplates}
          isCreatingApp={isCreatingApp}
        />
      </td>
    </tr>
  );
}

function RowActions({
  row,
  onEdit,
  onRemove,
  onAddWorkflow,
  onCreateApplication,
  onEngagement,
  hasPerCollegeTemplates,
  isCreatingApp,
}: {
  row: StudentCollegeRow;
  onEdit: (row: StudentCollegeRow) => void;
  onRemove: (row: StudentCollegeRow) => void;
  onAddWorkflow: (row: StudentCollegeRow) => void;
  onCreateApplication: (row: StudentCollegeRow) => void;
  onEngagement: (row: StudentCollegeRow) => void;
  hasPerCollegeTemplates: boolean;
  isCreatingApp: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100"
        aria-label="Row actions"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-52 rounded-md border border-gray-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEdit(row);
            }}
            className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            Edit details
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onCreateApplication(row);
            }}
            disabled={isCreatingApp}
            className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {row.application
              ? "View application"
              : isCreatingApp
                ? "Creating..."
                : "Create application"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onEngagement(row);
            }}
            className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            Interviews &amp; visits
          </button>
          {hasPerCollegeTemplates && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onAddWorkflow(row);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              Add supplement workflow
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onRemove(row);
            }}
            className="block w-full px-3 py-2 text-left text-sm text-danger-600 hover:bg-danger-50"
          >
            Remove from list
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column settings modal
// ---------------------------------------------------------------------------
function ColumnSettingsModal({
  open,
  onClose,
  visibleKeys,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  visibleKeys: string[];
  onSave: (keys: string[]) => void;
}) {
  const [selected, setSelected] = useState(new Set(visibleKeys));

  // Reset the selection during render whenever the modal opens or the saved
  // keys change while it is open.
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevVisibleKeys, setPrevVisibleKeys] = useState(visibleKeys);
  if (prevOpen !== open || prevVisibleKeys !== visibleKeys) {
    setPrevOpen(open);
    setPrevVisibleKeys(visibleKeys);
    if (open) setSelected(new Set(visibleKeys));
  }

  function toggle(key: string) {
    if (key === "college_name") return; // Always visible
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function save() {
    const ordered = ALL_COLUMNS.map((c) => c.key).filter((k) => selected.has(k));
    onSave(ordered);
    onClose();
  }

  // Group by group
  const groups: Record<string, ColumnDef[]> = {};
  for (const col of ALL_COLUMNS) {
    if (!groups[col.group]) groups[col.group] = [];
    groups[col.group].push(col);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Columns"
      description="Choose which columns to show. College name is always visible."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        {Object.entries(groups).map(([group, cols]) => (
          <div key={group}>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              {group}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {cols.map((col) => (
                <label
                  key={col.key}
                  className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(col.key)}
                    onChange={() => toggle(col.key)}
                    disabled={col.key === "college_name"}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span
                    className={
                      col.key === "college_name"
                        ? "text-gray-400"
                        : "text-gray-700"
                    }
                  >
                    {col.header}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Add college modal
// ---------------------------------------------------------------------------
function AddCollegeModal({
  open,
  onClose,
  studentId,
  allColleges,
  existingCollegeIds,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  allColleges: { id: string; name: string }[];
  existingCollegeIds: Set<string>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const available = allColleges.filter((c) => !existingCollegeIds.has(c.id));
    if (!search) return available;
    const term = search.toLowerCase();
    return available.filter((c) => c.name.toLowerCase().includes(term));
  }, [allColleges, existingCollegeIds, search]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("student_id", studentId);
    startTransition(async () => {
      const result = await addStudentCollege(formData);
      if (result.error) setError(result.error);
      else {
        setSearch("");
        onClose();
      }
    });
  }

  function handleClose() {
    setError(null);
    setSearch("");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add College"
      description="Add a college to this student's list"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert>{error}</Alert>
        )}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            College *
          </label>
          <Input
            placeholder="Search colleges..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-1"
          />
          <select
            name="college_id"
            required
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            size={6}
          >
            {filtered.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-400">
            {filtered.length} college{filtered.length !== 1 && "s"} available
          </p>
        </div>
        <Select
          name="category"
          label="Category"
          required
          placeholder="Select category"
          options={CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
        />
        <Select
          name="round_type"
          label="Application Round"
          placeholder="Select round (optional)"
          options={ROUND_OPTIONS}
        />
        <Input
          name="intended_major"
          label="Intended Major"
          placeholder="e.g. Computer Science"
        />
        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={isPending}>
            Add College
          </Button>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Edit college modal
// ---------------------------------------------------------------------------
function EditCollegeModal({
  open,
  onClose,
  entry,
}: {
  open: boolean;
  onClose: () => void;
  entry: StudentCollegeRow | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!entry) return null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateStudentCollege(entry!.id, formData);
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit — ${entry.colleges?.name ?? "College"}`}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert>{error}</Alert>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            name="category"
            label="Category"
            defaultValue={entry.category}
            options={CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
          />
          <Select
            name="status"
            label="Status"
            defaultValue={entry.status}
            options={STATUS_OPTIONS}
          />
          <Select
            name="round_type"
            label="Application Round"
            defaultValue={entry.round_type ?? ""}
            placeholder="None"
            options={ROUND_OPTIONS}
          />
          <Input
            name="intended_major"
            label="Intended Major"
            defaultValue={entry.intended_major ?? ""}
            placeholder="e.g. Computer Science"
          />
          <Select
            name="interest_level"
            label="Interest Level"
            defaultValue={entry.interest_level?.toString() ?? ""}
            placeholder="Not rated"
            options={[
              { value: "1", label: "1 — Low" },
              { value: "2", label: "2" },
              { value: "3", label: "3 — Medium" },
              { value: "4", label: "4" },
              { value: "5", label: "5 — High" },
            ]}
          />
          <Select
            name="counselor_fit_rating"
            label="Counselor Fit Rating"
            defaultValue={entry.counselor_fit_rating?.toString() ?? ""}
            placeholder="Not rated"
            options={[
              { value: "1", label: "1 — Poor Fit" },
              { value: "2", label: "2" },
              { value: "3", label: "3 — Moderate" },
              { value: "4", label: "4" },
              { value: "5", label: "5 — Great Fit" },
            ]}
          />
        </div>
        <Textarea
          name="notes"
          label="Notes"
          defaultValue={entry.notes ?? ""}
          placeholder="Internal counselor notes about this college for this student..."
        />
        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={isPending}>
            Save Changes
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Remove confirmation modal
// ---------------------------------------------------------------------------
function RemoveConfirmModal({
  open,
  onClose,
  entry,
}: {
  open: boolean;
  onClose: () => void;
  entry: StudentCollegeRow | null;
}) {
  const [isPending, startTransition] = useTransition();

  if (!entry) return null;

  function handleRemove() {
    startTransition(async () => {
      await removeStudentCollege(entry!.id);
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Remove College"
      description={`Are you sure you want to remove ${entry.colleges?.name ?? "this college"} from the list?`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleRemove} loading={isPending}>
            Remove
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-500">
        This will remove the college from the student&apos;s list. Any associated
        application data will remain but will no longer be linked to this list entry.
      </p>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Apply per-college supplement workflow modal
// ---------------------------------------------------------------------------
function SupplementWorkflowModal({
  open,
  onClose,
  studentId,
  entry,
  templates,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  entry: StudentCollegeRow | null;
  templates: PerCollegeTemplate[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!entry) return;
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("student_id", studentId);
    formData.set("student_college_id", entry.id);
    startTransition(async () => {
      const result = await applyWorkflowToStudent(formData);
      if (result.error) setError(result.error);
      else {
        onClose();
        router.refresh();
      }
    });
  }

  if (!entry) return null;
  const collegeName = entry.colleges?.name ?? "this college";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add supplement workflow"
      description={`Apply a per-college template to ${collegeName}. The workflow will be named for this school and timed to its application deadline.`}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <Alert>{error}</Alert>
        )}
        <Select
          name="template_id"
          label="Template"
          required
          placeholder="Select a template"
          options={templates.map((t) => ({
            value: t.id,
            label: `${t.name} (${t.step_count} steps)`,
          }))}
        />
        <Input
          name="start_date"
          label="Start date (optional)"
          type="date"
          placeholder="Defaults to deadline minus 45 days"
        />
        <p className="text-xs text-gray-500">
          Leave the start date blank to auto-compute it from the application&apos;s
          deadline (45 days before).
        </p>
        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={isPending}>
            Apply workflow
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function StudentCollegeListClient({
  studentId,
  studentName,
  graduationYear,
  collegeList,
  allColleges,
  perCollegeTemplates,
}: Props) {
  const toast = useToast();
  const router = useRouter();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showColumnsModal, setShowColumnsModal] = useState(false);
  const [editEntry, setEditEntry] = useState<StudentCollegeRow | null>(null);
  const [removeEntry, setRemoveEntry] = useState<StudentCollegeRow | null>(null);
  const [workflowEntry, setWorkflowEntry] = useState<StudentCollegeRow | null>(null);
  const [engagementEntry, setEngagementEntry] =
    useState<StudentCollegeRow | null>(null);

  const visibleKeysRaw = useSyncExternalStore(
    subscribeToColumnPrefs,
    getColumnPrefsSnapshot,
    getColumnPrefsServerSnapshot,
  );
  const visibleKeys = useMemo(() => {
    if (visibleKeysRaw) {
      try {
        return JSON.parse(visibleKeysRaw) as string[];
      } catch {}
    }
    return DEFAULT_VISIBLE_COLUMNS;
  }, [visibleKeysRaw]);

  // Local sort state — when key is "sort_order", drag-to-reorder is enabled.
  const [sortKey, setSortKey] = useState<string>("sort_order");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Server data is the source of truth; re-sync the optimistic local copy
  // during render whenever a revalidation delivers a new list.
  const [localList, setLocalList] = useState<StudentCollegeRow[]>(collegeList);
  const [prevCollegeList, setPrevCollegeList] = useState(collegeList);
  if (prevCollegeList !== collegeList) {
    setPrevCollegeList(collegeList);
    setLocalList(collegeList);
  }

  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const visibleColumns = useMemo(
    () => ALL_COLUMNS.filter((c) => visibleKeys.includes(c.key)),
    [visibleKeys],
  );

  const sortedList = useMemo(() => {
    if (sortKey === "sort_order") {
      return [...localList].sort((a, b) => a.sort_order - b.sort_order);
    }
    const col = ALL_COLUMNS.find((c) => c.key === sortKey);
    if (!col) return localList;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...localList].sort((a, b) => {
      const av = col.value(a);
      const bv = col.value(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls last
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [localList, sortKey, sortDir]);

  const existingCollegeIds = useMemo(
    () =>
      new Set(localList.map((e) => e.colleges?.id).filter(Boolean) as string[]),
    [localList],
  );

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortedList.findIndex((r) => r.id === active.id);
    const newIndex = sortedList.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(sortedList, oldIndex, newIndex);
    setLocalList(
      next.map((r, i) => ({ ...r, sort_order: i })),
    );
    startTransition(async () => {
      const result = await reorderStudentColleges(next.map((r) => r.id));
      if (result.error) {
        // Roll back on failure
        setLocalList(collegeList);
      } else {
        router.refresh();
      }
    });
  }

  function handleCreateApplication(row: StudentCollegeRow) {
    if (row.application) {
      router.push(`/applications/${row.application.id}`);
      return;
    }
    setCreatingFor(row.id);
    startTransition(async () => {
      const result = await createApplicationFromList(row.id);
      setCreatingFor(null);
      if ("error" in result) {
        toast(result.error, "error");
      } else {
        router.refresh();
      }
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const hasPerCollegeTemplates = perCollegeTemplates.length > 0;
  const totalCount = localList.length;
  const canDrag = sortKey === "sort_order";

  return (
    <PageShell
      title={`${studentName}'s College List`}
      description={`Class of ${graduationYear} · ${totalCount} college${totalCount !== 1 ? "s" : ""}`}
      actions={
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(`/students/${studentId}`)}
          >
            Back to Profile
          </Button>
          <Button variant="outline" onClick={() => setShowColumnsModal(true)}>
            Columns
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              window.open(
                `/students/${studentId}/colleges/print`,
                "_blank",
                "noopener",
              )
            }
            disabled={totalCount === 0}
            title={
              totalCount === 0 ? "Add colleges before exporting" : undefined
            }
          >
            Export to PDF
          </Button>
          <Button onClick={() => setShowAddModal(true)}>Add College</Button>
        </div>
      }
    >
      {totalCount > 0 && <ListBalanceSummary list={localList} />}
      {totalCount === 0 ? (
        <Card>
          <EmptyState
            title="No colleges yet"
            description="Start building this student's college list by adding schools to research and track."
            actionLabel="Add College"
            onAction={() => setShowAddModal(true)}
          />
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto px-0">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="w-8 px-2 py-2" aria-label="Reorder" />
                    {visibleColumns.map((col) => (
                      <th
                        key={col.key}
                        className={`px-3 py-2 font-medium text-gray-500 select-none ${
                          col.align === "right" ? "text-right" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          className="inline-flex items-center gap-1 hover:text-gray-900"
                        >
                          {col.header}
                          {sortKey === col.key && (
                            <span aria-hidden className="text-[10px]">
                              {sortDir === "asc" ? "▲" : "▼"}
                            </span>
                          )}
                        </button>
                      </th>
                    ))}
                    <th className="w-32 px-2 py-2 text-right font-medium text-gray-500">
                      <button
                        type="button"
                        onClick={() => {
                          setSortKey("sort_order");
                          setSortDir("asc");
                        }}
                        className="text-xs text-gray-500 hover:text-gray-900"
                        title="Reset to manual order"
                      >
                        {sortKey === "sort_order" ? "Manual" : "Reset"}
                      </button>
                    </th>
                  </tr>
                </thead>
                <SortableContext
                  items={sortedList.map((r) => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <tbody>
                    {sortedList.map((row) => (
                      <SortableRow
                        key={row.id}
                        row={row}
                        visibleColumns={visibleColumns}
                        canDrag={canDrag}
                        onEdit={setEditEntry}
                        onRemove={setRemoveEntry}
                        onAddWorkflow={setWorkflowEntry}
                        onEngagement={setEngagementEntry}
                        onCreateApplication={handleCreateApplication}
                        hasPerCollegeTemplates={hasPerCollegeTemplates}
                        isCreatingApp={creatingFor === row.id}
                      />
                    ))}
                  </tbody>
                </SortableContext>
              </table>
            </DndContext>
          </CardContent>
        </Card>
      )}

      <AddCollegeModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        studentId={studentId}
        allColleges={allColleges}
        existingCollegeIds={existingCollegeIds}
      />

      <EditCollegeModal
        open={!!editEntry}
        onClose={() => setEditEntry(null)}
        entry={editEntry}
      />

      <RemoveConfirmModal
        open={!!removeEntry}
        onClose={() => setRemoveEntry(null)}
        entry={removeEntry}
      />

      <SupplementWorkflowModal
        open={!!workflowEntry}
        onClose={() => setWorkflowEntry(null)}
        studentId={studentId}
        entry={workflowEntry}
        templates={perCollegeTemplates}
      />

      {engagementEntry && (
        <EngagementModal
          open={!!engagementEntry}
          onClose={() => setEngagementEntry(null)}
          studentCollegeId={engagementEntry.id}
          collegeName={engagementEntry.colleges?.name ?? "College"}
          interviewStatus={engagementEntry.interview_status}
          interviewAt={engagementEntry.interview_at}
          engagementLog={engagementEntry.engagement_log_json}
        />
      )}

      <ColumnSettingsModal
        open={showColumnsModal}
        onClose={() => setShowColumnsModal(false)}
        visibleKeys={visibleKeys}
        onSave={(keys) => {
          saveVisibleColumns(keys);
        }}
      />
    </PageShell>
  );
}
