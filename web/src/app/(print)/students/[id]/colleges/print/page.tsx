import { notFound } from "next/navigation";
import { getCollegeListExportData } from "@/lib/db/queries";
import { PrintTrigger, PrintButton } from "./print-trigger";

interface Props {
  params: Promise<{ id: string }>;
}

const CATEGORY_ORDER = ["safety", "likely", "target", "reach", "far_reach"];
const CATEGORY_LABEL: Record<string, string> = {
  safety: "Safety",
  likely: "Likely",
  target: "Target",
  reach: "Reach",
  far_reach: "Far Reach",
};
const CATEGORY_COLOR: Record<string, string> = {
  safety: "#16a34a",
  likely: "#10b981",
  target: "#3b82f6",
  reach: "#f59e0b",
  far_reach: "#dc2626",
};

const ROUND_LABEL: Record<string, string> = {
  ea: "Early Action",
  ed: "Early Decision",
  ed2: "ED II",
  rea: "REA",
  rd: "Regular Decision",
  rolling: "Rolling",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatPercent(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}

export default async function CollegeListPrintPage({ params }: Props) {
  const { id } = await params;
  const data = await getCollegeListExportData(id);
  if (!data) return notFound();

  const { firm, student, colleges, assignments, generatedBy, generatedAt } =
    data;

  const grouped = new Map<string, typeof colleges>();
  for (const key of CATEGORY_ORDER) grouped.set(key, []);
  for (const row of colleges) {
    if (!grouped.has(row.category)) grouped.set(row.category, []);
    grouped.get(row.category)!.push(row);
  }

  // Identify primary counselor(s) — fall back to all assignments if no primary.
  const primaryAssignments = assignments.filter((a) => a.is_primary);
  const counselorsToShow =
    primaryAssignments.length > 0 ? primaryAssignments : assignments;
  const generatorName = generatedBy
    ? `${generatedBy.first_name} ${generatedBy.last_name}`.trim()
    : "";

  const accent = firm.primary_color ?? "#4f46e5";

  return (
    <>
      <PrintTrigger />
      <style>{`
        @page { size: letter; margin: 0.5in; }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .category-section { break-inside: avoid; page-break-inside: avoid; }
        .college-row { break-inside: avoid; page-break-inside: avoid; }
      `}</style>

      <div className="mx-auto max-w-[8.5in] px-8 py-10 print:px-0 print:py-0">
        {/* Floating action bar — screen only */}
        <div className="no-print fixed right-6 top-6 z-50 flex gap-2">
          <PrintButton />
        </div>

        {/* Header */}
        <header
          className="flex items-start justify-between border-b-2 pb-4"
          style={{ borderColor: accent }}
        >
          <div className="flex items-center gap-4">
            {firm.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={firm.logo_url}
                alt={firm.name}
                className="h-12 w-auto"
              />
            )}
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500">
                {firm.name}
              </p>
              <h1
                className="mt-0.5 text-2xl font-bold leading-tight"
                style={{ color: accent }}
              >
                College List
              </h1>
            </div>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p>Generated {formatDate(generatedAt)}</p>
            {generatorName && <p className="mt-0.5">by {generatorName}</p>}
          </div>
        </header>

        {/* Student block */}
        <section className="mt-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Student
            </p>
            <p className="mt-1 text-lg font-semibold text-gray-900">
              {student.first_name} {student.last_name}
            </p>
            <p className="text-sm text-gray-600">
              Class of {student.graduation_year}
              {student.school_name ? ` · ${student.school_name}` : ""}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
              {counselorsToShow.length === 1 ? "Counselor" : "Counselors"}
            </p>
            {counselorsToShow.length === 0 ? (
              <p className="mt-1 text-sm text-gray-400">Not assigned</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {counselorsToShow.map((a, i) =>
                  a.user ? (
                    <li key={i} className="text-sm text-gray-900">
                      <span className="font-medium">
                        {a.user.first_name} {a.user.last_name}
                      </span>
                      <span className="text-gray-500">
                        {" "}
                        · {humanize(a.assignment_type)}
                      </span>
                      <br />
                      <span className="text-xs text-gray-500">
                        {a.user.email}
                      </span>
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </div>
        </section>

        {/* Summary line */}
        <p className="mt-6 text-sm text-gray-600">
          {colleges.length === 0
            ? "No colleges on this list yet."
            : `${colleges.length} college${colleges.length === 1 ? "" : "s"} across ${
                CATEGORY_ORDER.filter((c) => (grouped.get(c)?.length ?? 0) > 0)
                  .length
              } categor${
                CATEGORY_ORDER.filter((c) => (grouped.get(c)?.length ?? 0) > 0)
                  .length === 1
                  ? "y"
                  : "ies"
              }.`}
        </p>

        {/* Category sections */}
        <div className="mt-6 space-y-6">
          {CATEGORY_ORDER.map((cat) => {
            const rows = grouped.get(cat) ?? [];
            if (rows.length === 0) return null;
            const color = CATEGORY_COLOR[cat] ?? "#6b7280";
            return (
              <section key={cat} className="category-section">
                <div
                  className="flex items-baseline justify-between border-b pb-1.5"
                  style={{ borderColor: color }}
                >
                  <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-900">
                    <span
                      aria-hidden
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: color }}
                    />
                    {CATEGORY_LABEL[cat] ?? cat}
                  </h2>
                  <span className="text-xs text-gray-500">
                    {rows.length}{" "}
                    {rows.length === 1 ? "college" : "colleges"}
                  </span>
                </div>

                <table className="mt-2 w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-[10px] font-medium uppercase tracking-wider text-gray-500">
                      <th className="py-1.5 pr-3">College</th>
                      <th className="py-1.5 pr-3">Location</th>
                      <th className="py-1.5 pr-3">Round</th>
                      <th className="py-1.5 pr-3">Deadline</th>
                      <th className="py-1.5 pr-3">Major</th>
                      <th className="py-1.5 pr-3">Status</th>
                      <th className="py-1.5 pr-0 text-right">Accept</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.id}
                        className="college-row border-b border-gray-100 align-top"
                      >
                        <td className="py-1.5 pr-3 font-medium text-gray-900">
                          {r.college?.name ?? "—"}
                        </td>
                        <td className="py-1.5 pr-3 text-gray-600">
                          {[r.college?.city, r.college?.state_region]
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </td>
                        <td className="py-1.5 pr-3 text-gray-700">
                          {r.round_type
                            ? ROUND_LABEL[r.round_type] ?? r.round_type
                            : "—"}
                        </td>
                        <td className="py-1.5 pr-3 text-gray-700">
                          {formatDate(r.application?.deadline_at)}
                        </td>
                        <td className="py-1.5 pr-3 text-gray-700">
                          {r.intended_major ?? "—"}
                        </td>
                        <td className="py-1.5 pr-3 capitalize text-gray-700">
                          {r.status.replace(/_/g, " ")}
                        </td>
                        <td className="py-1.5 pr-0 text-right text-gray-700">
                          {formatPercent(r.college?.acceptance_rate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>

        {/* Notes */}
        {colleges.some((c) => c.notes && c.notes.trim().length > 0) && (
          <section className="mt-8 break-inside-avoid">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-900">
              Counselor Notes
            </h2>
            <div className="mt-2 space-y-3">
              {colleges
                .filter((c) => c.notes && c.notes.trim().length > 0)
                .map((c) => (
                  <div key={c.id} className="break-inside-avoid text-xs">
                    <p className="font-medium text-gray-900">
                      {c.college?.name ?? "—"}
                    </p>
                    <p className="mt-0.5 whitespace-pre-line text-gray-600">
                      {c.notes}
                    </p>
                  </div>
                ))}
            </div>
          </section>
        )}

        <footer className="mt-12 border-t border-gray-200 pt-3 text-center text-[10px] text-gray-400">
          {firm.name} · Generated via CounselWorks · {formatDate(generatedAt)}
        </footer>
      </div>
    </>
  );
}

function humanize(s: string): string {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
