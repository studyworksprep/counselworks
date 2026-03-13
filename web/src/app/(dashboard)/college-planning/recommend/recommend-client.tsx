"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface Recommendation {
  id: string;
  name: string;
  city: string | null;
  state_region: string | null;
  acceptance_rate: number | null;
  sat_avg: number | null;
  act_avg: number | null;
  tuition_out_state: number | null;
  net_price_avg: number | null;
  graduation_rate: number | null;
  institution_type: string | null;
  usnews_national_rank: number | null;
  usnews_liberal_arts_rank: number | null;
  score: number;
  factors: string[];
}

function pct(v: number | null) { return v == null ? "--" : `${(v * 100).toFixed(0)}%`; }
function usd(v: number | null) { return v == null ? "--" : `$${v.toLocaleString()}`; }

export function RecommendClient({
  students,
  selectedStudentId,
  studentData,
  recommendations,
}: {
  students: { id: string; name: string }[];
  selectedStudentId: string | null;
  studentData: Record<string, unknown> | null;
  recommendations: Recommendation[];
}) {
  const router = useRouter();

  function handleStudentChange(studentId: string) {
    if (studentId) {
      router.push(`/college-planning/recommend?student_id=${studentId}`);
    } else {
      router.push("/college-planning/recommend");
    }
  }

  const profile = studentData
    ? Array.isArray((studentData as Record<string, unknown>).student_profiles)
      ? ((studentData as Record<string, unknown>).student_profiles as Record<string, unknown>[])[0]
      : (studentData as Record<string, unknown>).student_profiles as Record<string, unknown> | null
    : null;

  return (
    <PageShell
      title="College Recommendations"
      description="AI-powered college suggestions based on student profile"
      actions={
        <Button variant="outline" onClick={() => router.push("/college-planning")}>
          Back to Planning
        </Button>
      }
    >
      {/* Student selector */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-end gap-4">
            <Select
              label="Select a Student"
              placeholder="Choose a student..."
              value={selectedStudentId ?? ""}
              onChange={(e) => handleStudentChange(e.target.value)}
              options={students.map((s) => ({ value: s.id, label: s.name }))}
              className="max-w-sm"
            />
            {studentData && profile && (
              <div className="flex gap-4 text-sm text-gray-500">
                {(profile as Record<string, unknown>).sat_score != null && (
                  <span>{`SAT: ${(profile as Record<string, unknown>).sat_score}`}</span>
                )}
                {(profile as Record<string, unknown>).act_score != null && (
                  <span>{`ACT: ${(profile as Record<string, unknown>).act_score}`}</span>
                )}
                {(studentData as Record<string, unknown>).gpa_unweighted != null && (
                  <span>{`GPA: ${(studentData as Record<string, unknown>).gpa_unweighted}`}</span>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!selectedStudentId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">
              Select a student to see personalized college recommendations based on their academic profile, test scores, geographic preferences, and financial needs.
            </p>
          </CardContent>
        </Card>
      ) : recommendations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 mb-2">
              No recommendations found for this student.
            </p>
            <p className="text-xs text-gray-400">
              Make sure the student has test scores and preferences filled in, and that colleges have scorecard data synced.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {recommendations.map((rec, index) => {
            const rank = rec.usnews_national_rank
              ? `#${rec.usnews_national_rank}`
              : rec.usnews_liberal_arts_rank
                ? `#${rec.usnews_liberal_arts_rank} LAC`
                : null;

            return (
              <Card key={rec.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <Link
                          href={`/college-planning/${rec.id}`}
                          className="text-lg font-semibold text-primary-600 hover:text-primary-700"
                        >
                          {rec.name}
                        </Link>
                        <p className="text-sm text-gray-500">
                          {[rec.city, rec.state_region].filter(Boolean).join(", ")}
                          {rec.institution_type && ` · ${rec.institution_type}`}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {rec.factors.map((f, i) => (
                            <Badge key={i} variant="success">
                              {f}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <div className="text-2xl font-bold text-primary-600">
                        {rec.score}
                      </div>
                      <p className="text-xs text-gray-400">match score</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-5 mt-4 pt-3 border-t border-gray-100">
                    <div>
                      <p className="text-xs text-gray-400">Accept Rate</p>
                      <p className="text-sm font-medium">{pct(rec.acceptance_rate)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">SAT Avg</p>
                      <p className="text-sm font-medium">{rec.sat_avg ?? "--"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Net Price</p>
                      <p className="text-sm font-medium">{usd(rec.net_price_avg)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Grad Rate</p>
                      <p className="text-sm font-medium">{pct(rec.graduation_rate)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Rank</p>
                      <p className="text-sm font-medium">{rank ?? "--"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
