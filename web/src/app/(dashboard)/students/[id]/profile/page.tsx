import { notFound } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import {
  getStudentByIdCached,
  getRecommendersForStudent,
  getStudentTestSittings,
} from "@/lib/db/queries";
import { TestingPlanCard } from "@/components/testing/testing-plan-card";
import { ProfileCard } from "../profile-card";
import { RecommendersCard } from "../recommenders-card";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Student Profile (fix plan 13.0): the academic record and preferences
 * the scorer/fit analysis reads — intake fields, testing plan, activities
 * and awards, recommenders. Edited here, read everywhere else.
 */
export default async function StudentProfilePage({ params }: Props) {
  const { id } = await params;
  const [student, recommenders, sittings] = await Promise.all([
    getStudentByIdCached(id),
    getRecommendersForStudent(id),
    getStudentTestSittings(id),
  ]);
  if (!student) return notFound();

  const profile = Array.isArray(student.student_profiles)
    ? student.student_profiles[0]
    : student.student_profiles;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-4">
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Academic Snapshot</h3>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              {[
                ["School", student.school_name ?? "—"],
                ["School type", student.school_type ?? "—"],
                ["GPA (unweighted)", student.gpa_unweighted ?? "—"],
                ["GPA (weighted)", student.gpa_weighted ?? "—"],
                ["Class rank", student.class_rank ?? "—"],
                ["Academic interests", student.academic_interests ?? "—"],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between gap-4">
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="text-right font-medium text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
            {student.extracurricular_summary && (
              <p className="mt-3 border-t border-gray-100 pt-3 text-sm text-gray-700">
                {student.extracurricular_summary}
              </p>
            )}
          </CardContent>
        </Card>

        <TestingPlanCard studentId={id} sittings={sittings} />
      </div>

      <div className="space-y-6 lg:col-span-8">
        <ProfileCard
          studentId={id}
          profile={{
            sat_score: profile?.sat_score ?? null,
            act_score: profile?.act_score ?? null,
            geographic_preferences: profile?.geographic_preferences ?? null,
            target_school_type: profile?.target_school_type ?? null,
            financial_aid_needed: profile?.financial_aid_needed ?? null,
            financial_aid_interest: profile?.financial_aid_interest ?? null,
            budget_range: profile?.budget_range ?? null,
            citizenship_status: profile?.citizenship_status ?? null,
            testing_summary_json: profile?.testing_summary_json ?? null,
            activities_json: profile?.activities_json ?? null,
            awards_json: profile?.awards_json ?? null,
          }}
          intakeSubmittedAt={profile?.intake_submitted_at ?? null}
        />

        <RecommendersCard studentId={id} recommenders={recommenders} />
      </div>
    </div>
  );
}
