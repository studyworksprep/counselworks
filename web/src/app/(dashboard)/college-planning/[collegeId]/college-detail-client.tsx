"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/modals/modal";
import { syncCollegeScorecard, addCollegeResearchNote } from "@/lib/actions/colleges";
import { formatDate } from "@/lib/utils";

interface CollegeData {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state_region: string | null;
  country: string | null;
  website_url: string | null;
  application_platform: string | null;
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

interface FitDimension {
  label: string;
  score: "strong" | "moderate" | "weak" | "unknown";
  detail: string;
}

interface FitStudent {
  student_college_id: string;
  student_id: string;
  student_name: string;
  category: string;
  counselor_fit_rating: number | null;
  dimensions: FitDimension[];
}

interface ResearchNote {
  id: string;
  title: string | null;
  body: string;
  note_type: string;
  created_at: string;
  author_name: string;
  student_name: string | null;
}

function pct(value: number | null) {
  if (value == null) return "--";
  return `${(value * 100).toFixed(1)}%`;
}

function usd(value: number | null) {
  if (value == null) return "--";
  return `$${value.toLocaleString()}`;
}

function num(value: number | null) {
  if (value == null) return "--";
  return value.toLocaleString();
}

function StatCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {sublabel && (
        <p className="mt-0.5 text-xs text-gray-400">{sublabel}</p>
      )}
    </div>
  );
}

const fitColors = {
  strong: "bg-green-100 text-green-700",
  moderate: "bg-yellow-100 text-yellow-700",
  weak: "bg-red-100 text-red-700",
  unknown: "bg-gray-100 text-gray-500",
};

function AddNoteModal({
  open,
  onClose,
  studentCollegeId,
}: {
  open: boolean;
  onClose: () => void;
  studentCollegeId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("student_college_id", studentCollegeId);
    startTransition(async () => {
      const result = await addCollegeResearchNote(formData);
      if (result.error) {
        setError(result.error);
      } else {
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Research Note">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <Input name="title" label="Title" placeholder="Optional title" />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Note *
          </label>
          <textarea
            name="body"
            required
            rows={4}
            placeholder="Research notes, observations, impressions..."
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Add Note"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function CollegeDetailClient({
  college,
  fitStudents = [],
  researchNotes = [],
}: {
  college: CollegeData;
  fitStudents?: FitStudent[];
  researchNotes?: ResearchNote[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [syncError, setSyncError] = useState<string | null>(null);
  const [noteModal, setNoteModal] = useState<string | null>(null);

  function handleSync() {
    setSyncError(null);
    startTransition(async () => {
      const result = await syncCollegeScorecard(college.id);
      if (result.error) {
        setSyncError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  const hasData = !!college.scorecard_synced_at;
  const syncDate = college.scorecard_synced_at
    ? new Date(college.scorecard_synced_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const location = [college.city, college.state_region]
    .filter(Boolean)
    .join(", ");

  return (
    <PageShell
      title={college.name}
      description={location || "College Research"}
      actions={
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleSync}
            disabled={isPending}
          >
            {isPending
              ? "Syncing..."
              : hasData
                ? "Refresh Scorecard Data"
                : "Fetch Scorecard Data"}
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/college-planning")}
          >
            Back to List
          </Button>
        </div>
      }
    >
      {syncError && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {syncError}
        </div>
      )}

      {/* Rankings (always shown if available) */}
      {(college.usnews_national_rank || college.usnews_liberal_arts_rank || college.usnews_business_rank) && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">
              US News Rankings
            </h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {college.usnews_national_rank && (
                <StatCard
                  label="National University"
                  value={`#${college.usnews_national_rank}`}
                />
              )}
              {college.usnews_liberal_arts_rank && (
                <StatCard
                  label="Liberal Arts College"
                  value={`#${college.usnews_liberal_arts_rank}`}
                />
              )}
              {college.usnews_business_rank && (
                <StatCard
                  label="Undergrad Business"
                  value={`#${college.usnews_business_rank}`}
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!hasData ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 mb-4">
              No College Scorecard data has been loaded for this school yet.
            </p>
            <Button onClick={handleSync} disabled={isPending}>
              {isPending ? "Fetching..." : "Fetch Data from College Scorecard"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Overview */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">Overview</h2>
              <p className="text-xs text-gray-400">
                Data from College Scorecard &middot; Last synced {syncDate}
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3 mb-6">
                {college.institution_type && (
                  <Badge variant="default">{college.institution_type}</Badge>
                )}
                {college.locale_type && (
                  <Badge variant="default">{college.locale_type}</Badge>
                )}
                {college.application_platform && (
                  <Badge variant="primary">
                    {college.application_platform}
                  </Badge>
                )}
                {college.website_url && (
                  <a
                    href={college.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary-600 hover:underline"
                  >
                    Website
                  </a>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                <StatCard
                  label="Acceptance Rate"
                  value={pct(college.acceptance_rate)}
                />
                <StatCard
                  label="Undergrad Size"
                  value={num(college.undergraduate_size)}
                />
                <StatCard
                  label="Graduation Rate"
                  value={pct(college.graduation_rate)}
                />
                <StatCard
                  label="Retention Rate"
                  value={pct(college.retention_rate)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Admissions */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">
                Admissions
              </h2>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <StatCard
                  label="Acceptance Rate"
                  value={pct(college.acceptance_rate)}
                />
                <StatCard
                  label="Average SAT"
                  value={college.sat_avg ? String(college.sat_avg) : "--"}
                  sublabel="Composite"
                />
                <StatCard
                  label="Average ACT"
                  value={college.act_avg ? String(college.act_avg) : "--"}
                  sublabel="Composite midpoint"
                />
              </div>
            </CardContent>
          </Card>

          {/* Cost & Financial */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">
                Cost & Financial Aid
              </h2>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                <StatCard
                  label="Tuition (In-State)"
                  value={usd(college.tuition_in_state)}
                />
                <StatCard
                  label="Tuition (Out-of-State)"
                  value={usd(college.tuition_out_state)}
                />
                <StatCard
                  label="Avg Net Price"
                  value={usd(college.net_price_avg)}
                  sublabel="After financial aid"
                />
                <StatCard
                  label="Federal Loan Rate"
                  value={pct(college.federal_loan_rate)}
                  sublabel="% students with fed loans"
                />
                <StatCard
                  label="Median Debt"
                  value={usd(college.median_debt)}
                  sublabel="At graduation"
                />
              </div>
            </CardContent>
          </Card>

          {/* Outcomes */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-gray-900">Outcomes</h2>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <StatCard
                  label="Graduation Rate"
                  value={pct(college.graduation_rate)}
                />
                <StatCard
                  label="Retention Rate"
                  value={pct(college.retention_rate)}
                  sublabel="First-year to second-year"
                />
                <StatCard
                  label="Median Earnings"
                  value={usd(college.earnings_median_10yr)}
                  sublabel="10 years after enrollment"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Student Fit Analysis */}
      {fitStudents.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">
              Student Fit Analysis
            </h2>
            <p className="text-xs text-gray-400">
              How well this college matches each student on your lists
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {fitStudents.map((fs) => (
                <div
                  key={fs.student_college_id}
                  className="rounded-lg border border-gray-200 p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-medium text-gray-900">
                        {fs.student_name}
                      </p>
                      <Badge
                        variant={
                          fs.category === "safety" || fs.category === "likely"
                            ? "success"
                            : fs.category === "target"
                              ? "primary"
                              : fs.category === "reach"
                                ? "warning"
                                : "danger"
                        }
                      >
                        {fs.category.replace("_", " ")}
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setNoteModal(fs.student_college_id)}
                    >
                      Add Note
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {fs.dimensions.map((dim) => (
                      <div
                        key={dim.label}
                        className={`rounded-md px-3 py-2 text-xs ${fitColors[dim.score]}`}
                      >
                        <p className="font-semibold">{dim.label}</p>
                        <p className="mt-0.5 opacity-80">{dim.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Research Notes */}
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Research Notes
            </h2>
            {fitStudents.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setNoteModal(fitStudents[0].student_college_id)}
              >
                Add Note
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {researchNotes.length === 0 ? (
            <p className="text-sm text-gray-500">
              No research notes yet.
              {fitStudents.length > 0
                ? " Add notes from the student fit analysis section above."
                : " Add this college to a student's list to start adding research notes."}
            </p>
          ) : (
            <ul className="space-y-3">
              {researchNotes.map((note) => (
                <li
                  key={note.id}
                  className="border-b border-gray-100 pb-3 last:border-0"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      {note.title && (
                        <p className="text-sm font-medium text-gray-900">
                          {note.title}
                        </p>
                      )}
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">
                        {note.body}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {note.author_name}
                        {note.student_name && ` · re: ${note.student_name}`}
                        {" · "}
                        {formatDate(note.created_at)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {noteModal && (
        <AddNoteModal
          open={!!noteModal}
          onClose={() => setNoteModal(null)}
          studentCollegeId={noteModal}
        />
      )}
    </PageShell>
  );
}
