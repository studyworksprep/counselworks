"use client";

import { useState, useCallback, useTransition, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/modals/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { addStudentCollege, reorderStudentColleges } from "@/lib/actions/colleges";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface CollegeListRow {
  id: string;
  category: string;
  round_type: string | null;
  intended_major: string | null;
  status: string;
  interest_level: number | null;
  sort_order: number;
  student_id: string;
  student_name: string;
  college_id: string;
  college_name: string;
  college_slug: string;
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
  usnews_national_rank: number | null;
  usnews_liberal_arts_rank: number | null;
  usnews_business_rank: number | null;
  has_scorecard: boolean;
}

// ---------------------------------------------------------------------------
// Column definitions — all available columns
// ---------------------------------------------------------------------------
const categoryVariant: Record<
  string,
  "success" | "warning" | "danger" | "primary" | "default"
> = {
  likely: "success",
  target: "primary",
  reach: "warning",
  far_reach: "danger",
  safety: "success",
};

function pct(value: number | null) {
  if (value == null) return "--";
  return `${(value * 100).toFixed(0)}%`;
}
function usd(value: number | null) {
  if (value == null) return "--";
  return `$${value.toLocaleString()}`;
}
function num(value: number | null) {
  if (value == null) return "--";
  return value.toLocaleString();
}

interface ColumnDef {
  key: string;
  header: string;
  group: string;
  render: (row: CollegeListRow) => React.ReactNode;
}

const ALL_COLUMNS: ColumnDef[] = [
  {
    key: "college_name",
    header: "College",
    group: "Core",
    render: (row) => (
      <div>
        <span className="font-medium text-gray-900">{row.college_name}</span>
        {!row.has_scorecard && (
          <span className="ml-2 text-[10px] text-gray-400">No data</span>
        )}
      </div>
    ),
  },
  {
    key: "student_name",
    header: "Student",
    group: "Core",
    render: (row) => <span className="text-gray-600">{row.student_name}</span>,
  },
  {
    key: "category",
    header: "Category",
    group: "Core",
    render: (row) => (
      <Badge variant={categoryVariant[row.category] ?? "default"}>
        {row.category.replace("_", " ")}
      </Badge>
    ),
  },
  {
    key: "status",
    header: "Status",
    group: "Core",
    render: (row) => <Badge variant="default">{row.status}</Badge>,
  },
  {
    key: "round_type",
    header: "Round",
    group: "Application",
    render: (row) => (
      <span className="text-gray-600 text-xs uppercase">
        {row.round_type ?? "--"}
      </span>
    ),
  },
  {
    key: "intended_major",
    header: "Major",
    group: "Application",
    render: (row) => (
      <span className="text-gray-600 text-sm">{row.intended_major ?? "--"}</span>
    ),
  },
  {
    key: "usnews_rank",
    header: "US News",
    group: "Rankings",
    render: (row) => {
      const label = row.usnews_national_rank
        ? `#${row.usnews_national_rank}`
        : row.usnews_liberal_arts_rank
          ? `#${row.usnews_liberal_arts_rank} LAC`
          : "--";
      return <span className="text-gray-600 text-sm">{label}</span>;
    },
  },
  {
    key: "usnews_business_rank",
    header: "Business Rank",
    group: "Rankings",
    render: (row) => (
      <span className="text-gray-600 text-sm">
        {row.usnews_business_rank ? `#${row.usnews_business_rank}` : "--"}
      </span>
    ),
  },
  {
    key: "acceptance_rate",
    header: "Accept Rate",
    group: "Admissions",
    render: (row) => (
      <span className="text-gray-600 text-sm">{pct(row.acceptance_rate)}</span>
    ),
  },
  {
    key: "sat_avg",
    header: "SAT Avg",
    group: "Admissions",
    render: (row) => (
      <span className="text-gray-600 text-sm">{row.sat_avg ?? "--"}</span>
    ),
  },
  {
    key: "act_avg",
    header: "ACT Avg",
    group: "Admissions",
    render: (row) => (
      <span className="text-gray-600 text-sm">{row.act_avg ?? "--"}</span>
    ),
  },
  {
    key: "undergraduate_size",
    header: "Enrollment",
    group: "School Info",
    render: (row) => (
      <span className="text-gray-600 text-sm">{num(row.undergraduate_size)}</span>
    ),
  },
  {
    key: "institution_type",
    header: "Type",
    group: "School Info",
    render: (row) => (
      <span className="text-gray-600 text-sm">{row.institution_type ?? "--"}</span>
    ),
  },
  {
    key: "locale_type",
    header: "Setting",
    group: "School Info",
    render: (row) => (
      <span className="text-gray-600 text-sm">{row.locale_type ?? "--"}</span>
    ),
  },
  {
    key: "tuition_in_state",
    header: "Tuition (In-State)",
    group: "Cost",
    render: (row) => (
      <span className="text-gray-600 text-sm">{usd(row.tuition_in_state)}</span>
    ),
  },
  {
    key: "tuition_out_state",
    header: "Tuition (OOS)",
    group: "Cost",
    render: (row) => (
      <span className="text-gray-600 text-sm">{usd(row.tuition_out_state)}</span>
    ),
  },
  {
    key: "net_price_avg",
    header: "Net Price",
    group: "Cost",
    render: (row) => (
      <span className="text-gray-600 text-sm">{usd(row.net_price_avg)}</span>
    ),
  },
  {
    key: "median_debt",
    header: "Median Debt",
    group: "Cost",
    render: (row) => (
      <span className="text-gray-600 text-sm">{usd(row.median_debt)}</span>
    ),
  },
  {
    key: "federal_loan_rate",
    header: "Loan Rate",
    group: "Cost",
    render: (row) => (
      <span className="text-gray-600 text-sm">{pct(row.federal_loan_rate)}</span>
    ),
  },
  {
    key: "graduation_rate",
    header: "Grad Rate",
    group: "Outcomes",
    render: (row) => (
      <span className="text-gray-600 text-sm">{pct(row.graduation_rate)}</span>
    ),
  },
  {
    key: "retention_rate",
    header: "Retention",
    group: "Outcomes",
    render: (row) => (
      <span className="text-gray-600 text-sm">{pct(row.retention_rate)}</span>
    ),
  },
  {
    key: "earnings_median_10yr",
    header: "10yr Earnings",
    group: "Outcomes",
    render: (row) => (
      <span className="text-gray-600 text-sm">{usd(row.earnings_median_10yr)}</span>
    ),
  },
];

const DEFAULT_VISIBLE_COLUMNS = [
  "college_name",
  "student_name",
  "category",
  "usnews_rank",
  "acceptance_rate",
  "sat_avg",
  "tuition_out_state",
  "graduation_rate",
  "round_type",
  "status",
];

const STORAGE_KEY = "counselworks:college-planning:columns";

function loadVisibleColumns(): string[] {
  if (typeof window === "undefined") return DEFAULT_VISIBLE_COLUMNS;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return DEFAULT_VISIBLE_COLUMNS;
}

// ---------------------------------------------------------------------------
// Sortable row component
// ---------------------------------------------------------------------------
function SortableRow({
  row,
  columns,
  onRowClick,
}: {
  row: CollegeListRow;
  columns: ColumnDef[];
  onRowClick: (row: CollegeListRow) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="border-b border-gray-100 transition-colors cursor-pointer hover:bg-gray-50"
      onClick={() => onRowClick(row)}
    >
      <td className="px-2 py-3 w-8">
        <button
          type="button"
          className="cursor-grab touch-none text-gray-400 hover:text-gray-600 p-1"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <circle cx="5" cy="3" r="1.5" />
            <circle cx="11" cy="3" r="1.5" />
            <circle cx="5" cy="8" r="1.5" />
            <circle cx="11" cy="8" r="1.5" />
            <circle cx="5" cy="13" r="1.5" />
            <circle cx="11" cy="13" r="1.5" />
          </svg>
        </button>
      </td>
      {columns.map((col) => (
        <td key={col.key} className="px-4 py-3">
          {col.render(row)}
        </td>
      ))}
    </tr>
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
  const [selected, setSelected] = useState<Set<string>>(
    new Set(visibleKeys)
  );

  // Reset selections when modal opens
  const handleClose = () => {
    setSelected(new Set(visibleKeys));
    onClose();
  };

  function toggle(key: string) {
    // College name is always visible
    if (key === "college_name") return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const groups = useMemo(() => {
    const map = new Map<string, ColumnDef[]>();
    for (const col of ALL_COLUMNS) {
      const list = map.get(col.group) ?? [];
      list.push(col);
      map.set(col.group, list);
    }
    return map;
  }, []);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Customize Columns"
      description="Choose which data columns to display in the table"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              // Preserve order from ALL_COLUMNS
              const ordered = ALL_COLUMNS
                .filter((c) => selected.has(c.key))
                .map((c) => c.key);
              onSave(ordered);
              onClose();
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="space-y-4 max-h-[60vh] overflow-y-auto">
        {Array.from(groups.entries()).map(([group, cols]) => (
          <div key={group}>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {group}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {cols.map((col) => (
                <label
                  key={col.key}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 select-none"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(col.key)}
                    disabled={col.key === "college_name"}
                    onChange={() => toggle(col.key)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  {col.header}
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
// Add to College List modal
// ---------------------------------------------------------------------------
function AddCollegeModal({
  open,
  onClose,
  students,
  colleges,
}: {
  open: boolean;
  onClose: () => void;
  students: { id: string; name: string }[];
  colleges: { id: string; name: string }[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [collegeSearch, setCollegeSearch] = useState("");

  const filteredColleges = useMemo(() => {
    if (!collegeSearch) return colleges;
    const term = collegeSearch.toLowerCase();
    return colleges.filter((c) => c.name.toLowerCase().includes(term));
  }, [colleges, collegeSearch]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await addStudentCollege(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setCollegeSearch("");
        onClose();
      }
    });
  }

  function handleClose() {
    setError(null);
    setCollegeSearch("");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add to College List"
      description="Add a college to a student's research list"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Select
          name="student_id"
          label="Student *"
          required
          placeholder="Select a student"
          options={students.map((s) => ({
            value: s.id,
            label: s.name,
          }))}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            College *
          </label>
          <Input
            placeholder="Type to search colleges..."
            value={collegeSearch}
            onChange={(e) => setCollegeSearch(e.target.value)}
            className="mb-1"
          />
          <select
            name="college_id"
            required
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            size={5}
          >
            {filteredColleges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-400">
            {filteredColleges.length} college{filteredColleges.length !== 1 && "s"}
          </p>
        </div>

        <Select
          name="category"
          label="Category *"
          required
          placeholder="Select category"
          options={[
            { value: "safety", label: "Safety" },
            { value: "likely", label: "Likely" },
            { value: "target", label: "Target" },
            { value: "reach", label: "Reach" },
            { value: "far_reach", label: "Far Reach" },
          ]}
        />

        <Select
          name="round_type"
          label="Application Round"
          placeholder="Select round (optional)"
          options={[
            { value: "ea", label: "Early Action" },
            { value: "ed", label: "Early Decision" },
            { value: "ed2", label: "ED II" },
            { value: "rea", label: "REA" },
            { value: "rd", label: "Regular Decision" },
            { value: "rolling", label: "Rolling" },
          ]}
        />

        <Input name="intended_major" label="Intended Major" placeholder="e.g. Computer Science" />

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding..." : "Add to List"}
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
// Main component
// ---------------------------------------------------------------------------
export function CollegePlanningClient({
  list,
  students,
  colleges,
}: {
  list: CollegeListRow[];
  students: { id: string; name: string }[];
  colleges: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);

  // Column visibility
  const [visibleKeys, setVisibleKeys] = useState<string[]>(loadVisibleColumns);
  const visibleColumns = useMemo(
    () => ALL_COLUMNS.filter((c) => visibleKeys.includes(c.key)),
    [visibleKeys]
  );

  function saveColumns(keys: string[]) {
    setVisibleKeys(keys);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
    } catch {}
  }

  // Drag-and-drop state — local list for optimistic reorder
  const [localList, setLocalList] = useState(list);
  // Keep in sync when server data refreshes
  if (list !== localList && JSON.stringify(list.map((r) => r.id)) !== JSON.stringify(localList.map((r) => r.id))) {
    setLocalList(list);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setLocalList((prev) => {
        const oldIndex = prev.findIndex((r) => r.id === active.id);
        const newIndex = prev.findIndex((r) => r.id === over.id);
        const next = arrayMove(prev, oldIndex, newIndex);

        // Persist new order
        startTransition(() => {
          reorderStudentColleges(next.map((r) => r.id));
        });

        return next;
      });
    },
    [startTransition]
  );

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/college-planning?${params.toString()}`);
  }

  return (
    <PageShell
      title="College Planning"
      description="Manage college lists across all students"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/college-planning/discover")}>
            Discover
          </Button>
          <Button variant="outline" onClick={() => router.push("/college-planning/recommend")}>
            Recommendations
          </Button>
          <Button variant="outline" onClick={() => setShowColumnModal(true)}>
            Columns
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            Add to College List
          </Button>
        </div>
      }
    >
      <Card>
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <Input
              placeholder="Search colleges or students..."
              defaultValue={searchParams.get("search") ?? ""}
              onChange={(e) => updateFilter("search", e.target.value)}
              className="max-w-xs"
            />
            <Select
              placeholder="All categories"
              value={searchParams.get("category") ?? ""}
              onChange={(e) => updateFilter("category", e.target.value)}
              options={[
                { value: "likely", label: "Likely" },
                { value: "target", label: "Target" },
                { value: "reach", label: "Reach" },
                { value: "far_reach", label: "Far Reach" },
                { value: "safety", label: "Safety" },
              ]}
              className="w-40"
            />
            <span className="text-sm text-gray-500">
              {localList.length} college{localList.length !== 1 && "s"}
            </span>
          </div>
        </div>

        {localList.length === 0 ? (
          <EmptyState
            title="No college lists yet"
            description="Start adding colleges to student lists to track applications and deadlines."
            actionLabel="Add to College List"
            onAction={() => setShowAddModal(true)}
          />
        ) : (
          <div className="overflow-x-auto">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-2 py-3 w-8" />
                    {visibleColumns.map((col) => (
                      <th
                        key={col.key}
                        className="px-4 py-3 font-medium text-gray-500"
                      >
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <SortableContext
                  items={localList.map((r) => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <tbody>
                    {localList.map((row) => (
                      <SortableRow
                        key={row.id}
                        row={row}
                        columns={visibleColumns}
                        onRowClick={(r) =>
                          router.push(`/college-planning/${r.college_id}`)
                        }
                      />
                    ))}
                  </tbody>
                </SortableContext>
              </table>
            </DndContext>
          </div>
        )}
      </Card>

      <AddCollegeModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        students={students}
        colleges={colleges}
      />

      <ColumnSettingsModal
        open={showColumnModal}
        onClose={() => setShowColumnModal(false)}
        visibleKeys={visibleKeys}
        onSave={saveColumns}
      />
    </PageShell>
  );
}
