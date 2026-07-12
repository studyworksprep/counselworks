import { notFound } from "next/navigation";
import { getStudentProgressReportData } from "@/lib/db/queries";
import {
  PrintTrigger,
  PrintButton,
} from "../colleges/print/print-trigger";
import {
  ROUND_SHORT_LABELS,
  STAGE_LABELS,
} from "@/lib/constants/applications";

interface Props {
  params: Promise<{ id: string }>;
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const DECISION_COLOR: Record<string, string> = {
  accepted: "#15803d",
  rejected: "#b91c1c",
  waitlisted: "#b45309",
  deferred: "#b45309",
};

/**
 * Point-in-time printable progress report (fix plan 10.2) — the
 * "where does my $20K stand" deliverable. Family-safe content only;
 * accessible to staff and to the student's own family.
 */
export default async function ProgressReportPage({ params }: Props) {
  const { id } = await params;
  const data = await getStudentProgressReportData(id);
  if (!data) return notFound();

  const decided = data.applications.filter((a) => a.decision_result);

  return (
    <div className="mx-auto max-w-3xl bg-white p-10 text-gray-900 print:p-0">
      <PrintTrigger />
      <div className="mb-2 flex items-start justify-between print:hidden">
        <PrintButton />
      </div>

      <header className="border-b-2 border-indigo-600 pb-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
          {data.firmName}
        </p>
        <h1 className="mt-1 text-2xl font-bold">
          Progress Report — {data.student.first_name} {data.student.last_name}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Class of {data.student.graduation_year}
          {data.student.school_name && ` · ${data.student.school_name}`} ·
          Generated {fmt(data.generatedAt)}
        </p>
      </header>

      <section className="mt-6">
        <h2 className="text-base font-semibold">Roadmap progress</h2>
        {data.workflows.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">No active roadmaps.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {data.workflows.map((w) => {
              const pct =
                w.total > 0 ? Math.round((w.completed / w.total) * 100) : 0;
              return (
                <li key={w.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{w.name}</span>
                    <span className="text-gray-500">
                      {w.completed}/{w.total} steps ({pct}%)
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full bg-indigo-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="text-base font-semibold">Applications</h2>
        {data.applications.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">No applications yet.</p>
        ) : (
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-1.5 pr-2">College</th>
                <th className="py-1.5 pr-2">Round</th>
                <th className="py-1.5 pr-2">Stage</th>
                <th className="py-1.5 pr-2">Deadline</th>
                <th className="py-1.5 pr-2">Checklist</th>
                <th className="py-1.5">Decision</th>
              </tr>
            </thead>
            <tbody>
              {data.applications.map((a) => (
                <tr key={a.id} className="border-b border-gray-100">
                  <td className="py-1.5 pr-2 font-medium">{a.college_name}</td>
                  <td className="py-1.5 pr-2">
                    {ROUND_SHORT_LABELS[a.application_type] ??
                      a.application_type}
                  </td>
                  <td className="py-1.5 pr-2">
                    {STAGE_LABELS[a.stage] ?? a.stage}
                  </td>
                  <td className="py-1.5 pr-2">{fmt(a.deadline_at)}</td>
                  <td className="py-1.5 pr-2">
                    {a.checklist_total > 0
                      ? `${a.checklist_done}/${a.checklist_total}`
                      : "—"}
                  </td>
                  <td
                    className="py-1.5 font-medium capitalize"
                    style={{
                      color: a.decision_result
                        ? DECISION_COLOR[a.decision_result]
                        : undefined,
                    }}
                  >
                    {a.decision_result ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {decided.length > 0 && (
        <section className="mt-6">
          <h2 className="text-base font-semibold">Decisions received</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {decided.map((a) => (
              <li key={a.id}>
                <span className="font-medium">{a.college_name}</span> —{" "}
                <span
                  className="capitalize"
                  style={{ color: DECISION_COLOR[a.decision_result!] }}
                >
                  {a.decision_result}
                </span>{" "}
                <span className="text-gray-500">({fmt(a.decision_at)})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-base font-semibold">Coming up</h2>
        <div className="mt-2 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 print:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Meetings
            </h3>
            {data.meetings.length === 0 ? (
              <p className="mt-1 text-gray-500">None scheduled.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {data.meetings.map((m) => (
                  <li key={m.id}>
                    {m.title}{" "}
                    <span className="text-gray-500">
                      ({fmt(m.scheduled_start_at)})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Open tasks
            </h3>
            {data.tasks.length === 0 ? (
              <p className="mt-1 text-gray-500">Nothing outstanding.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {data.tasks.map((t) => (
                  <li key={t.id}>
                    {t.title}
                    {t.due_at && (
                      <span className="text-gray-500"> (due {fmt(t.due_at)})</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <footer className="mt-10 border-t border-gray-200 pt-3 text-xs text-gray-400">
        Prepared by {data.firmName} · CounselWorks
      </footer>
    </div>
  );
}
