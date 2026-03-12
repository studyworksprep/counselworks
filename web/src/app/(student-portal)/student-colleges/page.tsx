import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getStudentCollegeList } from "@/lib/db/queries";

interface CollegeType {
  id: string;
  name: string;
  slug: string;
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
  institution_type: string | null;
  locale_type: string | null;
  usnews_national_rank: number | null;
  usnews_liberal_arts_rank: number | null;
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

const statusBadgeVariant: Record<string, "default" | "primary" | "success"> = {
  researching: "default",
  applied: "primary",
  decision_received: "success",
};

const categoryOrder = ["safety", "likely", "target", "reach", "far_reach"];

export default async function StudentCollegesPage() {
  const data = await getStudentCollegeList();

  if (!data) {
    redirect("/sign-in");
  }

  // Group colleges by category
  const grouped: Record<string, typeof data> = {};
  for (const item of data) {
    const cat = item.category ?? "target";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  }

  const sortedCategories = categoryOrder.filter((cat) => grouped[cat]?.length);

  return (
    <PageShell
      title="My College List"
      description="Research and track your college options"
    >
      {data.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-4 text-sm text-gray-500">
              No colleges on your list yet. Your counselor will help you build
              your college list.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {sortedCategories.map((category) => {
            const items = grouped[category];
            return (
              <section key={category}>
                <div className="mb-4 flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {categoryLabels[category] ?? category}
                  </h2>
                  <Badge variant={categoryBadgeVariant[category] ?? "default"}>
                    {items.length}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((item) => {
                    const college = (item as Record<string, unknown>)
                      .colleges as CollegeType | CollegeType[] | null;
                    const c = college
                      ? Array.isArray(college)
                        ? college[0]
                        : college
                      : null;

                    if (!c) return null;

                    return (
                      <Card key={item.id}>
                        <CardContent>
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-gray-900">
                              {c.name}
                            </h3>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {item.round_type && (
                                <Badge variant="outline">
                                  {item.round_type.toUpperCase()}
                                </Badge>
                              )}
                              {item.status && (
                                <Badge
                                  variant={
                                    statusBadgeVariant[item.status] ?? "default"
                                  }
                                >
                                  {item.status.replace(/_/g, " ")}
                                </Badge>
                              )}
                            </div>
                          </div>

                          {item.intended_major && (
                            <p className="mt-1 text-sm text-gray-600">
                              {item.intended_major}
                            </p>
                          )}

                          <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                            <div>
                              <p className="text-gray-500">Acceptance</p>
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
                              <p className="text-gray-500">Grad Rate</p>
                              <p className="mt-0.5 font-medium text-gray-900">
                                {pct(c.graduation_rate)}
                              </p>
                            </div>
                          </div>

                          {(c.usnews_national_rank ||
                            c.usnews_liberal_arts_rank) && (
                            <p className="mt-2 text-xs text-gray-500">
                              US News Rank:{" "}
                              <span className="font-medium text-gray-700">
                                {c.usnews_national_rank
                                  ? `#${c.usnews_national_rank} National`
                                  : `#${c.usnews_liberal_arts_rank} Liberal Arts`}
                              </span>
                            </p>
                          )}
                        </CardContent>
                      </Card>
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
