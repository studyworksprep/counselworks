import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getParentCollegeLists } from "@/lib/db/queries";

interface CollegeType {
  id: string;
  name: string;
  slug: string;
  acceptance_rate: number | null;
  sat_avg: number | null;
  tuition_out_state: number | null;
  net_price_avg: number | null;
  graduation_rate: number | null;
  usnews_national_rank: number | null;
}

interface StudentType {
  first_name: string;
  last_name: string;
}

function pct(v: number | null): string {
  if (v == null) return "\u2014";
  return `${(v * 100).toFixed(1)}%`;
}

function usd(v: number | null): string {
  if (v == null) return "\u2014";
  return `$${v.toLocaleString("en-US")}`;
}

const categoryLabels: Record<string, string> = {
  safety: "Safety",
  likely: "Likely",
  target: "Target",
  reach: "Reach",
  far_reach: "Far Reach",
};

const categoryBadgeVariant: Record<string, "success" | "primary" | "warning" | "danger" | "default"> = {
  safety: "success",
  likely: "success",
  target: "primary",
  reach: "warning",
  far_reach: "danger",
};

const categoryOrder = ["safety", "likely", "target", "reach", "far_reach"];

export default async function FamilyCollegesPage() {
  const data = await getParentCollegeLists();

  if (!data) {
    redirect("/sign-in");
  }

  const { students, colleges } = data;

  // Build a map of student_id -> student info
  const studentMap: Record<string, { first_name: string; last_name: string; graduation_year: number | null }> = {};
  for (const s of students) {
    studentMap[s.id] = {
      first_name: s.first_name,
      last_name: s.last_name,
      graduation_year: s.graduation_year,
    };
  }

  // Group colleges by student_id
  const byStudent: Record<string, typeof colleges> = {};
  for (const item of colleges) {
    const sid = item.student_id;
    if (!byStudent[sid]) byStudent[sid] = [];
    byStudent[sid].push(item);
  }

  const hasColleges = colleges.length > 0;

  return (
    <PageShell
      title="College Lists"
      description="View your family's college research and planning"
    >
      {!hasColleges ? (
        <Card>
          <CardContent>
            <p className="py-4 text-sm text-gray-500">
              No colleges on any student&apos;s list yet. College lists will
              appear here as your students build them with their counselor.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-10">
          {students.map((student) => {
            const studentColleges = byStudent[student.id];
            if (!studentColleges || studentColleges.length === 0) return null;

            // Group this student's colleges by category
            const grouped: Record<string, typeof studentColleges> = {};
            for (const item of studentColleges) {
              const cat = item.category ?? "target";
              if (!grouped[cat]) grouped[cat] = [];
              grouped[cat].push(item);
            }

            const sortedCategories = categoryOrder.filter(
              (cat) => grouped[cat]?.length
            );

            return (
              <section key={student.id}>
                <h2 className="mb-4 text-xl font-semibold text-gray-900">
                  {student.first_name} {student.last_name}
                  {student.graduation_year && (
                    <span className="ml-2 text-base font-normal text-gray-500">
                      Class of {student.graduation_year}
                    </span>
                  )}
                </h2>

                <div className="space-y-6">
                  {sortedCategories.map((category) => {
                    const items = grouped[category];
                    return (
                      <div key={category}>
                        <div className="mb-3 flex items-center gap-2">
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">
                            {categoryLabels[category] ?? category}
                          </h3>
                          <Badge
                            variant={
                              categoryBadgeVariant[category] ?? "default"
                            }
                          >
                            {items.length}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {items.map((item) => {
                            const collegeRaw = (
                              item as Record<string, unknown>
                            ).colleges as
                              | CollegeType
                              | CollegeType[]
                              | null;
                            const c = collegeRaw
                              ? Array.isArray(collegeRaw)
                                ? collegeRaw[0]
                                : collegeRaw
                              : null;

                            if (!c) return null;

                            return (
                              <Card key={item.id}>
                                <CardContent>
                                  <div className="flex items-start justify-between gap-2">
                                    <h4 className="font-semibold text-gray-900">
                                      {c.name}
                                    </h4>
                                    <div className="flex shrink-0 items-center gap-1.5">
                                      <Badge
                                        variant={
                                          categoryBadgeVariant[item.category] ??
                                          "default"
                                        }
                                      >
                                        {categoryLabels[item.category] ??
                                          item.category}
                                      </Badge>
                                    </div>
                                  </div>

                                  {item.round_type && (
                                    <p className="mt-1 text-xs text-gray-500">
                                      Round:{" "}
                                      <span className="font-medium text-gray-700">
                                        {item.round_type.toUpperCase()}
                                      </span>
                                    </p>
                                  )}

                                  <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                                    <div>
                                      <p className="text-gray-500">
                                        Acceptance
                                      </p>
                                      <p className="mt-0.5 font-medium text-gray-900">
                                        {pct(c.acceptance_rate)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-gray-500">Avg SAT</p>
                                      <p className="mt-0.5 font-medium text-gray-900">
                                        {c.sat_avg ?? "\u2014"}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-gray-500">Tuition</p>
                                      <p className="mt-0.5 font-medium text-gray-900">
                                        {usd(c.tuition_out_state)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-gray-500">
                                        Grad Rate
                                      </p>
                                      <p className="mt-0.5 font-medium text-gray-900">
                                        {pct(c.graduation_rate)}
                                      </p>
                                    </div>
                                  </div>

                                  {c.usnews_national_rank && (
                                    <p className="mt-2 text-xs text-gray-500">
                                      US News Rank:{" "}
                                      <span className="font-medium text-gray-700">
                                        #{c.usnews_national_rank}
                                      </span>
                                    </p>
                                  )}
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
