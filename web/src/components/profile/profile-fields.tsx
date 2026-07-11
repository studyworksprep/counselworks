"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

/**
 * Shared building blocks for the counselor profile editor and the portal
 * intake forms. Field names line up with src/lib/actions/profile.ts.
 */

export interface ProfileValues {
  sat_score: number | null;
  act_score: number | null;
  geographic_preferences: string[] | null;
  target_school_type: string | null;
  financial_aid_needed: boolean | null;
  financial_aid_interest: string | null;
  budget_range: string | null;
  citizenship_status: string | null;
  testing_summary_json: unknown;
  activities_json: unknown;
  awards_json: unknown;
}

export function TestingAndPreferenceFields({
  values,
}: {
  values: ProfileValues;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Input
          name="sat_score"
          label="Best SAT (composite)"
          type="number"
          min={400}
          max={1600}
          defaultValue={values.sat_score ?? ""}
          placeholder="e.g. 1480"
        />
        <Input
          name="act_score"
          label="Best ACT (composite)"
          type="number"
          min={1}
          max={36}
          defaultValue={values.act_score ?? ""}
          placeholder="e.g. 33"
        />
      </div>
      <Input
        name="geographic_preferences"
        label="Geographic preferences"
        defaultValue={(values.geographic_preferences ?? []).join(", ")}
        placeholder="Comma-separated states, e.g. MA, NY, CA"
      />
      <Select
        name="target_school_type"
        label="School type preference"
        defaultValue={values.target_school_type ?? ""}
        options={[
          { value: "", label: "No preference" },
          { value: "public", label: "Public" },
          { value: "private", label: "Private" },
        ]}
      />
    </>
  );
}

export function FinancialFields({ values }: { values: ProfileValues }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Input
          name="budget_range"
          label="Budget range"
          defaultValue={values.budget_range ?? ""}
          placeholder="e.g. $30–50k per year"
        />
        <Select
          name="financial_aid_interest"
          label="Interested in financial aid?"
          defaultValue={values.financial_aid_interest ?? ""}
          options={[
            { value: "", label: "Not specified" },
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "unsure", label: "Unsure" },
          ]}
        />
      </div>
      <Input
        name="citizenship_status"
        label="Citizenship status"
        defaultValue={values.citizenship_status ?? ""}
        placeholder="e.g. US citizen, permanent resident, F-1"
      />
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          name="financial_aid_needed"
          defaultChecked={values.financial_aid_needed ?? false}
          className="h-4 w-4 rounded border-gray-300"
        />
        Need-based aid will be required (used for affordability matching)
      </label>
    </>
  );
}

// ---------------------------------------------------------------------------
// Generic list editor for the JSON record columns
// ---------------------------------------------------------------------------

interface RowsEditorColumn {
  key: string;
  label: string;
  placeholder?: string;
}

function normalizeRows(value: unknown): Record<string, string>[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return { name: item };
    const obj = item as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string") out[k] = v;
      else if (v != null) out[k] = String(v);
    }
    return out;
  });
}

/**
 * Editable row list serialized into a hidden JSON field (parsed and
 * whitelisted server-side).
 */
export function RowsEditor({
  name,
  label,
  columns,
  initial,
  addLabel,
}: {
  name: string;
  label: string;
  columns: RowsEditorColumn[];
  initial: unknown;
  addLabel: string;
}) {
  const [rows, setRows] = useState<Record<string, string>[]>(() =>
    normalizeRows(initial)
  );

  function updateRow(index: number, key: string, value: string) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    );
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input type="hidden" name={name} value={JSON.stringify(rows)} />
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-start gap-2">
            {columns.map((col) => (
              <input
                key={col.key}
                value={row[col.key] ?? ""}
                onChange={(e) => updateRow(i, col.key, e.target.value)}
                placeholder={col.placeholder ?? col.label}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            ))}
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="mt-1.5 shrink-0 text-xs text-gray-400 hover:text-red-600"
              aria-label="Remove row"
            >
              ✕
            </button>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setRows((prev) => [...prev, {}])}
        >
          {addLabel}
        </Button>
      </div>
    </div>
  );
}

export function TestingRowsEditor({ initial }: { initial: unknown }) {
  return (
    <RowsEditor
      name="testing_summary_json"
      label="Test history"
      addLabel="Add test"
      columns={[
        { key: "test_name", label: "Test", placeholder: "e.g. SAT (Mar 2026)" },
        { key: "score", label: "Score", placeholder: "e.g. 1450" },
      ]}
      initial={initial}
    />
  );
}

export function ActivitiesRowsEditor({ initial }: { initial: unknown }) {
  return (
    <RowsEditor
      name="activities_json"
      label="Activities"
      addLabel="Add activity"
      columns={[
        { key: "name", label: "Activity", placeholder: "e.g. Debate Team" },
        { key: "role", label: "Role", placeholder: "e.g. Captain" },
        { key: "description", label: "Description" },
      ]}
      initial={initial}
    />
  );
}

export function AwardsRowsEditor({ initial }: { initial: unknown }) {
  return (
    <RowsEditor
      name="awards_json"
      label="Awards & honors"
      addLabel="Add award"
      columns={[
        { key: "name", label: "Award", placeholder: "e.g. AIME Qualifier" },
        { key: "level", label: "Level", placeholder: "e.g. National" },
        { key: "year", label: "Year", placeholder: "e.g. 2026" },
      ]}
      initial={initial}
    />
  );
}
