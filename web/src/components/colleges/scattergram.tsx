"use client";

import { useId, useMemo, useState } from "react";
import { Select } from "@/components/ui/select";
import { ROUND_SHORT_LABELS } from "@/lib/constants/applications";
import {
  buildScattergram,
  outcomeMark,
  OUTCOME_MARKS,
  SAT_MAX,
  SAT_MIN,
  testScoreForPlot,
  type OutcomePoint,
  type PlottedPoint,
} from "@/lib/colleges/scattergram";

/**
 * Scattergram (fix plan 13.2): the firm's decision history at one college,
 * test score × GPA, one mark per decided application. Outcome is encoded
 * twice — a status color and a shape — with a legend, a per-mark hover
 * tooltip (24px hit target), and a table view, so nothing depends on color
 * or on hovering. Pure SVG; no chart library.
 */

export interface SelfMarker {
  label: string;
  gpa: number | null;
  sat: number | null;
  act: number | null;
}

const W = 640;
const H = 360;
const PAD = { top: 16, right: 16, bottom: 44, left: 48 };
const R = 5; // ≥ 8px marks (r 5 → 10px), 2px surface ring drawn beneath

function MarkShape({
  shape,
  cx,
  cy,
  className,
  r = R,
}: {
  shape: "circle" | "cross" | "triangle" | "square" | "diamond";
  cx: number;
  cy: number;
  className: string;
  r?: number;
}) {
  const ring = "stroke-white";
  switch (shape) {
    case "circle":
      return <circle cx={cx} cy={cy} r={r} className={`${className} ${ring}`} strokeWidth={2} paintOrder="stroke" />;
    case "square":
      return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} className={`${className} ${ring}`} strokeWidth={2} paintOrder="stroke" />;
    case "triangle":
      return (
        <polygon
          points={`${cx},${cy - r - 1} ${cx + r + 1},${cy + r} ${cx - r - 1},${cy + r}`}
          className={`${className} ${ring}`}
          strokeWidth={2}
          paintOrder="stroke"
        />
      );
    case "diamond":
      return (
        <polygon
          points={`${cx},${cy - r - 2} ${cx + r + 2},${cy} ${cx},${cy + r + 2} ${cx - r - 2},${cy}`}
          className={`${className} ${ring}`}
          strokeWidth={2}
          paintOrder="stroke"
        />
      );
    case "cross": {
      // A cross reads smaller than a disc of the same radius; widen it.
      const a = r + 1.5;
      const t = 2.4;
      // A rotated plus sign, filled, so it carries the outcome color like the others.
      const d = [
        `M ${cx - a} ${cy - a + t} L ${cx - a + t} ${cy - a} L ${cx} ${cy - t}`,
        `L ${cx + a - t} ${cy - a} L ${cx + a} ${cy - a + t} L ${cx + t} ${cy}`,
        `L ${cx + a} ${cy + a - t} L ${cx + a - t} ${cy + a} L ${cx} ${cy + t}`,
        `L ${cx - a + t} ${cy + a} L ${cx - a} ${cy + a - t} L ${cx - t} ${cy} Z`,
      ].join(" ");
      return <path d={d} className={`${className} ${ring}`} strokeWidth={2} paintOrder="stroke" />;
    }
  }
}

function describeScore(p: { sat: number | null; act: number | null }): string {
  const s = testScoreForPlot(p.sat, p.act);
  if (!s) return "No test score";
  return s.source === "sat" ? `SAT ${s.value}` : `ACT ${p.act} (≈ SAT ${s.value})`;
}

function describeGpa(p: { gpa: number | null; gpa_scale: string | null }): string {
  if (p.gpa === null) return "No GPA";
  return `GPA ${p.gpa.toFixed(2)}${p.gpa_scale === "weighted" ? " (weighted)" : ""}`;
}

export function Scattergram({
  points,
  self = null,
  showNames,
  classYears = [],
  title,
}: {
  points: OutcomePoint[];
  /** "You are here" marker for a portal viewer's own student. */
  self?: SelfMarker | null;
  /** Staff surfaces show student names (where the viewer may see them). */
  showNames: boolean;
  /** Staff season filter; hidden when there is only one class year. */
  classYears?: number[];
  title: string;
}) {
  const [classYear, setClassYear] = useState("");
  const [hover, setHover] = useState<PlottedPoint | null>(null);
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();

  const filtered = useMemo(
    () =>
      classYear
        ? points.filter((p) => String(p.graduation_year) === classYear)
        : points,
    [points, classYear]
  );
  const chart = useMemo(() => buildScattergram(filtered), [filtered]);

  const selfScore = self ? testScoreForPlot(self.sat, self.act) : null;
  const selfPlottable = self && selfScore && self.gpa !== null;
  const yMin = chart.yMin;
  const yMax = selfPlottable && self.gpa !== null && self.gpa > chart.yMax ? Math.min(5, Math.ceil(self.gpa * 2) / 2) : chart.yMax;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const xOf = (score: number) => PAD.left + ((score - SAT_MIN) / (SAT_MAX - SAT_MIN)) * plotW;
  const yOf = (gpa: number) => PAD.top + plotH - ((gpa - yMin) / (yMax - yMin)) * plotH;

  const xTicks: number[] = [];
  for (let s = SAT_MIN; s <= SAT_MAX; s += 200) xTicks.push(s);
  const yTicks: number[] = [];
  for (let g = yMin; g <= yMax + 1e-9; g += 0.5) yTicks.push(Math.round(g * 2) / 2);

  const summary = OUTCOME_MARKS.filter((m) => (chart.counts[m.value] ?? 0) > 0)
    .map((m) => `${chart.counts[m.value]} ${m.label.toLowerCase()}`)
    .join(" · ");

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600" data-testid="scattergram-summary">
          <span className="font-medium text-gray-900">
            {chart.total} decision{chart.total === 1 ? "" : "s"}
          </span>
          {summary && <span> · {summary}</span>}
          {chart.unplotted.length > 0 && (
            <span className="text-gray-500">
              {" "}· {chart.unplotted.length} without a GPA or test score on file
            </span>
          )}
        </p>
        <div className="flex items-center gap-3">
          {classYears.length > 1 && (
            <Select
              aria-label="Class year"
              placeholder="All class years"
              value={classYear}
              onChange={(e) => setClassYear(e.target.value)}
              options={classYears.map((y) => ({ value: String(y), label: `Class of ${y}` }))}
              className="w-44"
            />
          )}
          <button
            type="button"
            onClick={() => setShowTable((v) => !v)}
            className="text-xs font-medium text-primary-600 hover:underline"
          >
            {showTable ? "Hide table" : "Show table"}
          </button>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-labelledby={titleId}
          className="h-auto w-full max-w-3xl"
          onMouseLeave={() => setHover(null)}
        >
          <title id={titleId}>{title}</title>
          {/* Recessive hairline grid */}
          {xTicks.map((s) => (
            <g key={`x${s}`}>
              <line x1={xOf(s)} x2={xOf(s)} y1={PAD.top} y2={PAD.top + plotH} className="stroke-gray-200" strokeWidth={1} />
              <text x={xOf(s)} y={H - PAD.bottom + 18} textAnchor="middle" className="fill-gray-500" fontSize={11}>
                {s}
              </text>
            </g>
          ))}
          {yTicks.map((g) => (
            <g key={`y${g}`}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={yOf(g)} y2={yOf(g)} className="stroke-gray-200" strokeWidth={1} />
              <text x={PAD.left - 8} y={yOf(g) + 4} textAnchor="end" className="fill-gray-500" fontSize={11}>
                {g.toFixed(1)}
              </text>
            </g>
          ))}
          <text x={PAD.left + plotW / 2} y={H - 6} textAnchor="middle" className="fill-gray-600" fontSize={11}>
            Test score (SAT scale; ACT concorded)
          </text>
          <text
            x={12}
            y={PAD.top + plotH / 2}
            textAnchor="middle"
            transform={`rotate(-90 12 ${PAD.top + plotH / 2})`}
            className="fill-gray-600"
            fontSize={11}
          >
            GPA
          </text>

          {/* Marks: shape + status color, white ring, 24px hit target */}
          {chart.plotted.map((p) => {
            const mark = outcomeMark(p.decision_result);
            const cx = xOf(p.x);
            const cy = yOf(p.y);
            const active = hover?.id === p.id;
            return (
              <g key={p.id} data-testid="scattergram-point" data-outcome={p.decision_result}>
                <MarkShape shape={mark.shape} cx={cx} cy={cy} className={mark.fillClass} r={active ? R + 2 : R} />
                <circle
                  cx={cx}
                  cy={cy}
                  r={12}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${mark.label}: ${describeScore(p)}, ${describeGpa(p)}`}
                  onMouseEnter={() => setHover(p)}
                  onFocus={() => setHover(p)}
                  onBlur={() => setHover(null)}
                  className="cursor-pointer outline-none"
                />
              </g>
            );
          })}

          {/* The viewer's own student */}
          {selfPlottable && selfScore && self.gpa !== null && (
            <g data-testid="scattergram-self">
              <MarkShape shape="diamond" cx={xOf(selfScore.value)} cy={yOf(self.gpa)} className="fill-gray-900" r={R + 1} />
              <text x={xOf(selfScore.value) + 12} y={yOf(self.gpa) + 4} className="fill-gray-900" fontSize={11} fontWeight={600}>
                {self.label}
              </text>
            </g>
          )}
        </svg>

        {hover && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs shadow-md"
            style={{
              left: `${(xOf(hover.x) / W) * 100}%`,
              top: `${(yOf(hover.y) / H) * 100}%`,
              transform: "translate(12px, -50%)",
            }}
          >
            <p className={`font-semibold ${outcomeMark(hover.decision_result).textClass}`}>
              {outcomeMark(hover.decision_result).label}
            </p>
            <p className="text-gray-900">{describeScore(hover)}</p>
            <p className="text-gray-900">{describeGpa(hover)}</p>
            <p className="text-gray-500">
              {ROUND_SHORT_LABELS[hover.application_type] ?? hover.application_type}
              {hover.graduation_year ? ` · Class of ${hover.graduation_year}` : ""}
            </p>
            {showNames && (
              <p className="text-gray-500">{hover.student_name ?? "Another student"}</p>
            )}
          </div>
        )}
      </div>

      {/* Legend: always present (4 series), shape + label so identity never rides on color alone */}
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-700" aria-label="Legend">
        {OUTCOME_MARKS.map((m) => (
          <li key={m.value} className="flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <MarkShape shape={m.shape} cx={8} cy={8} className={m.fillClass} r={4} />
            </svg>
            {m.label}
          </li>
        ))}
        {self && (
          <li className="flex items-center gap-1.5">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <MarkShape shape="diamond" cx={8} cy={8} className="fill-gray-900" r={4} />
            </svg>
            {self.label}
            {!selfPlottable && " (add a GPA and test score to plot)"}
          </li>
        )}
      </ul>

      {showTable && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="scattergram-table">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                {showNames && <th className="py-2 pr-3">Student</th>}
                {showNames && <th className="py-2 pr-3">Class</th>}
                <th className="py-2 pr-3">Round</th>
                <th className="py-2 pr-3">Decision</th>
                <th className="py-2 pr-3">Test score</th>
                <th className="py-2">GPA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-gray-100">
                  {showNames && (
                    <td className="py-2 pr-3 font-medium text-gray-900">
                      {p.student_name ?? "Another student"}
                    </td>
                  )}
                  {showNames && <td className="py-2 pr-3 text-gray-600">{p.graduation_year ?? "—"}</td>}
                  <td className="py-2 pr-3 text-gray-600">
                    {ROUND_SHORT_LABELS[p.application_type] ?? p.application_type}
                  </td>
                  <td className={`py-2 pr-3 font-medium ${outcomeMark(p.decision_result).textClass}`}>
                    {outcomeMark(p.decision_result).label}
                  </td>
                  <td className="py-2 pr-3 text-gray-600">{describeScore(p)}</td>
                  <td className="py-2 text-gray-600">{describeGpa(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
