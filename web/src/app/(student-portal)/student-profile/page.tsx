import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { getStudentProfile } from "@/lib/db/queries";
import { StudentIntakeForm } from "./intake-form";

function safeParseJsonArray(value: unknown): unknown[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default async function StudentProfilePage() {
  const data = await getStudentProfile();

  if (!data) {
    redirect("/sign-in");
  }

  const profile = data.profile ?? null;

  const intendedMajors = safeParseJsonArray(data.intended_majors_json);
  const testingScores = safeParseJsonArray(profile?.testing_summary_json);
  const activities = safeParseJsonArray(profile?.activities_json);
  const awards = safeParseJsonArray(profile?.awards_json);

  return (
    <PageShell
      title="My Profile"
      description={`${data.school_name ? data.school_name + " \u00b7 " : ""}Class of ${data.graduation_year}`}
    >
      <div className="space-y-6">
        <StudentIntakeForm
          profile={{
            sat_score: profile?.sat_score ?? null,
            act_score: profile?.act_score ?? null,
            geographic_preferences: profile?.geographic_preferences ?? null,
            target_school_type: profile?.target_school_type ?? null,
            financial_aid_needed: profile?.financial_aid_needed ?? null,
            financial_aid_interest: profile?.financial_aid_interest ?? null,
            budget_range: profile?.budget_range ?? null,
            citizenship_status: null,
            testing_summary_json: profile?.testing_summary_json ?? null,
            activities_json: profile?.activities_json ?? null,
            awards_json: profile?.awards_json ?? null,
          }}
          intakeSubmittedAt={profile?.intake_submitted_at ?? null}
        />

        {/* Academic Info */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">
              Academic Info
            </h2>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-sm text-gray-500">GPA (Unweighted)</dt>
                <dd className="mt-0.5 text-sm font-medium text-gray-900">
                  {data.gpa_unweighted ?? "\u2014"}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">GPA (Weighted)</dt>
                <dd className="mt-0.5 text-sm font-medium text-gray-900">
                  {data.gpa_weighted ?? "\u2014"}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Class Rank</dt>
                <dd className="mt-0.5 text-sm font-medium text-gray-900">
                  {data.class_rank ?? "\u2014"}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">School Type</dt>
                <dd className="mt-0.5 text-sm font-medium capitalize text-gray-900">
                  {data.school_type?.replace(/_/g, " ") ?? "\u2014"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-sm text-gray-500">Intended Majors</dt>
                <dd className="mt-0.5 text-sm font-medium text-gray-900">
                  {intendedMajors.length > 0
                    ? intendedMajors.map((m) => (typeof m === "string" ? m : String(m))).join(", ")
                    : "\u2014"}
                </dd>
              </div>
              {data.academic_interests && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className="text-sm text-gray-500">Academic Interests</dt>
                  <dd className="mt-0.5 text-sm font-medium text-gray-900">
                    {data.academic_interests}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Test Scores */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">
              Test Scores
            </h2>
          </CardHeader>
          <CardContent>
            {testingScores.length === 0 ? (
              <p className="text-sm text-gray-400">Not yet added</p>
            ) : (
              <ul className="space-y-2">
                {testingScores.map((item, idx) => {
                  if (typeof item === "string") {
                    return (
                      <li key={idx} className="text-sm text-gray-900">
                        {item}
                      </li>
                    );
                  }
                  const obj = item as Record<string, unknown>;
                  const testName =
                    obj.test_name ?? obj.name ?? obj.test ?? "Test";
                  const score = obj.score ?? obj.value ?? "";
                  return (
                    <li
                      key={idx}
                      className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0"
                    >
                      <span className="text-sm text-gray-700">
                        {String(testName)}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {String(score)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Activities */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Activities</h2>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-sm text-gray-400">Not yet added</p>
            ) : (
              <ul className="space-y-2">
                {activities.map((item, idx) => {
                  if (typeof item === "string") {
                    return (
                      <li key={idx} className="text-sm text-gray-900">
                        {item}
                      </li>
                    );
                  }
                  const obj = item as Record<string, unknown>;
                  const name =
                    obj.name ?? obj.activity ?? obj.title ?? "Activity";
                  const role = obj.role ?? obj.position ?? "";
                  const description = obj.description ?? obj.details ?? "";
                  return (
                    <li
                      key={idx}
                      className="border-b border-gray-100 pb-2 last:border-0"
                    >
                      <p className="text-sm font-medium text-gray-900">
                        {String(name)}
                        {role ? ` \u2014 ${String(role)}` : ""}
                      </p>
                      {description && (
                        <p className="mt-0.5 text-sm text-gray-500">
                          {String(description)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Awards */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">Awards</h2>
          </CardHeader>
          <CardContent>
            {awards.length === 0 ? (
              <p className="text-sm text-gray-400">Not yet added</p>
            ) : (
              <ul className="space-y-2">
                {awards.map((item, idx) => {
                  if (typeof item === "string") {
                    return (
                      <li key={idx} className="text-sm text-gray-900">
                        {item}
                      </li>
                    );
                  }
                  const obj = item as Record<string, unknown>;
                  const name = obj.name ?? obj.title ?? obj.award ?? "Award";
                  const year = obj.year ?? obj.grade ?? "";
                  const level = obj.level ?? "";
                  return (
                    <li
                      key={idx}
                      className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0"
                    >
                      <span className="text-sm text-gray-900">
                        {String(name)}
                      </span>
                      <span className="text-xs text-gray-500">
                        {[level, year].filter(Boolean).map(String).join(" \u00b7 ")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* College Preferences */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">
              College Preferences
            </h2>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-gray-500">Budget Range</dt>
                <dd className="mt-0.5 text-sm font-medium text-gray-900">
                  {profile?.budget_range ?? "\u2014"}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">
                  Financial Aid Interest
                </dt>
                <dd className="mt-0.5 text-sm font-medium capitalize text-gray-900">
                  {profile?.financial_aid_interest ?? "\u2014"}
                </dd>
              </div>
              {data.extracurricular_summary && (
                <div className="sm:col-span-2">
                  <dt className="text-sm text-gray-500">
                    Extracurricular Summary
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium text-gray-900">
                    {data.extracurricular_summary}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
