"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  previewClientImport,
  runClientImport,
  type ImportPlan,
  type ImportResult,
  type RowPlan,
} from "@/lib/actions/import";
import { IMPORT_COLUMNS, IMPORT_MAX_ROWS } from "@/lib/import/csv";

const ACTION_LABEL: Record<string, { text: string; variant: "success" | "default" | "warning" | "danger" }> = {
  create: { text: "Create", variant: "success" },
  existing: { text: "Existing", variant: "default" },
  skip_existing: { text: "Already exists", variant: "default" },
  link_existing: { text: "Link", variant: "success" },
  skip_member: { text: "Already a member", variant: "default" },
  assign: { text: "Assign", variant: "success" },
  skip_assigned: { text: "Already assigned", variant: "default" },
  unknown: { text: "Unknown staff", variant: "danger" },
};

function ActionBadge({ action }: { action: string | null }) {
  if (!action) return <span className="text-gray-400">—</span>;
  const a = ACTION_LABEL[action] ?? { text: action, variant: "default" as const };
  return <Badge variant={a.variant}>{a.text}</Badge>;
}

/**
 * Two-step import: preview (dry run, nothing written) → import. The same
 * file is submitted both times; the server re-plans it, so the preview is
 * informative, never authoritative.
 */
export function ImportClient({ template }: { template: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const templateHref = useMemo(
    () => `data:text/csv;charset=utf-8,${encodeURIComponent(template)}`,
    [template]
  );

  function submit(kind: "preview" | "run") {
    if (!file) {
      setError("Choose a CSV file");
      return;
    }
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      if (kind === "preview") {
        setResult(null);
        const r = await previewClientImport(formData);
        if ("error" in r) setError(r.error);
        else setPlan(r.plan);
      } else {
        const r = await runClientImport(formData);
        if ("error" in r) setError(r.error);
        else {
          setResult(r.result);
          setPlan(null);
        }
      }
    });
  }

  const totalToCreate = plan
    ? plan.toCreate.families + plan.toCreate.students + plan.toCreate.parents + plan.toCreate.assignments
    : 0;
  const canImport = !!plan && plan.headerErrors.length === 0 && plan.invalidRows === 0 && totalToCreate > 0;

  return (
    <PageShell
      title="Import Clients"
      description="Add households, students, parents, and counselor assignments from a spreadsheet"
    >
      <div className="max-w-5xl space-y-6">
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">1. Prepare the file</h3>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-600">
            <p>
              One row per student. Required columns: household name, student
              first and last name, graduation year. Optional: school, address,
              one parent (first name, last name, email, relationship), and the
              email of the staff member to assign. Households are matched by
              name, students by household + name + class year, parents by
              email — so re-importing the same file creates nothing.
            </p>
            <p className="font-mono text-xs text-gray-500">{IMPORT_COLUMNS.join(", ")}</p>
            <a
              href={templateHref}
              download="counselworks-import-template.csv"
              className="inline-block text-primary-600 hover:text-primary-700"
            >
              Download the template
            </a>
            <p className="text-xs text-gray-500">Up to {IMPORT_MAX_ROWS} rows per file.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">2. Preview</h3>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit("preview");
              }}
              className="flex flex-wrap items-center gap-3"
            >
              <input
                type="file"
                name="file"
                accept=".csv,text/csv"
                aria-label="CSV file"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setPlan(null);
                  setResult(null);
                  setError(null);
                }}
                className="text-sm"
              />
              <Button type="submit" variant="outline" loading={isPending} disabled={!file}>
                Preview
              </Button>
            </form>
            {error && (
              <div className="mt-3">
                <Alert>{error}</Alert>
              </div>
            )}

            {plan && (
              <div className="mt-4 space-y-3">
                {plan.headerErrors.map((h) => (
                  <Alert key={h}>{h}</Alert>
                ))}
                {plan.unknownHeaders.length > 0 && (
                  <p className="text-xs text-warning-700">
                    Ignored columns: {plan.unknownHeaders.join(", ")}
                  </p>
                )}
                {plan.rows.length > 0 && (
                  <>
                    <p className="text-sm text-gray-700" data-testid="import-summary">
                      {plan.toCreate.families} household{plan.toCreate.families === 1 ? "" : "s"},{" "}
                      {plan.toCreate.students} student{plan.toCreate.students === 1 ? "" : "s"},{" "}
                      {plan.toCreate.parents} parent{plan.toCreate.parents === 1 ? "" : "s"}, and{" "}
                      {plan.toCreate.assignments} assignment{plan.toCreate.assignments === 1 ? "" : "s"}{" "}
                      to create
                      {plan.invalidRows > 0 && (
                        <span className="text-danger-600">
                          {" "}· {plan.invalidRows} row{plan.invalidRows === 1 ? "" : "s"} need fixing
                        </span>
                      )}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                            <th className="py-2 pr-3">Line</th>
                            <th className="py-2 pr-3">Household</th>
                            <th className="py-2 pr-3">Student</th>
                            <th className="py-2 pr-3">Parent</th>
                            <th className="py-2 pr-3">Counselor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plan.rows.map((r: RowPlan) => (
                            <tr key={r.line} className="border-b border-gray-100 align-top">
                              <td className="py-2 pr-3 text-gray-500">{r.line}</td>
                              <td className="py-2 pr-3">
                                <div className="text-gray-900">{r.household || "—"}</div>
                                <ActionBadge action={r.familyAction} />
                              </td>
                              <td className="py-2 pr-3">
                                <div className="text-gray-900">{r.student}</div>
                                <ActionBadge action={r.studentAction} />
                                {r.errors.length > 0 && (
                                  <ul className="mt-1 list-disc pl-4 text-xs text-danger-600">
                                    {r.errors.map((e) => (
                                      <li key={e}>{e}</li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                              <td className="py-2 pr-3">
                                {r.parent && <div className="text-gray-900">{r.parent}</div>}
                                <ActionBadge action={r.parentAction} />
                              </td>
                              <td className="py-2 pr-3">
                                {r.counselor && <div className="text-gray-900">{r.counselor}</div>}
                                <ActionBadge action={r.counselorAction} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">3. Import</h3>
          </CardHeader>
          <CardContent className="space-y-3">
            {result ? (
              <div className="space-y-2 text-sm text-gray-700">
                <p data-testid="import-result">
                  Imported: {result.families} household{result.families === 1 ? "" : "s"},{" "}
                  {result.students} student{result.students === 1 ? "" : "s"},{" "}
                  {result.parents} parent{result.parents === 1 ? "" : "s"},{" "}
                  {result.assignments} assignment{result.assignments === 1 ? "" : "s"}
                  {result.skippedStudents > 0 &&
                    ` · ${result.skippedStudents} student${result.skippedStudents === 1 ? "" : "s"} already existed`}
                </p>
                <div className="flex gap-3">
                  <Link href="/students" className="text-primary-600 hover:text-primary-700">
                    Open the student roster
                  </Link>
                  <Link href="/families" className="text-primary-600 hover:text-primary-700">
                    Open families
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600">
                  {plan
                    ? canImport
                      ? "Everything in the preview will be created. Imported parents are placeholders until you invite them to the portal."
                      : plan.invalidRows > 0
                        ? "Fix the flagged rows in your file and preview again."
                        : "Nothing new to import — every row already exists."
                    : "Preview the file first."}
                </p>
                <Button type="button" onClick={() => submit("run")} loading={isPending} disabled={!canImport}>
                  Import
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
