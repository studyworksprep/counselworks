import { redirect } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getStudentEssays } from "@/lib/db/queries";
import { formatDate } from "@/lib/utils";

const essayTypeLabels: Record<string, string> = {
  personal_statement: "Personal Statement",
  common_app: "Common App",
  coalition_app: "Coalition App",
  supplemental: "Supplemental",
  scholarship: "Scholarship",
  why_us: "Why Us",
  activity_description: "Activity Description",
  additional_info: "Additional Info",
  other: "Other",
};

const statusVariant: Record<string, "default" | "primary" | "warning" | "success" | "danger"> = {
  draft: "default",
  in_review: "primary",
  revision_requested: "warning",
  approved: "success",
  final: "success",
};

export default async function StudentEssaysPage() {
  const essays = await getStudentEssays();

  if (!essays) redirect("/sign-in");

  return (
    <PageShell
      title="My Essays"
      description="View and track your essay progress"
    >
      {essays.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-4 text-sm text-gray-500">
              No essays yet. Your counselor will set up essay prompts for you.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {essays.map((essay) => {
            const wordCount = essay.body
              ? essay.body.trim().split(/\s+/).filter(Boolean).length
              : 0;

            return (
              <Card key={essay.id}>
                <CardContent>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {essay.title || essayTypeLabels[essay.essay_type] || essay.essay_type}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {essayTypeLabels[essay.essay_type] ?? essay.essay_type}
                        {essay.title && essayTypeLabels[essay.essay_type]
                          ? ` · ${essayTypeLabels[essay.essay_type]}`
                          : ""}
                      </p>
                    </div>
                    <Badge variant={statusVariant[essay.status] ?? "default"}>
                      {essay.status.replace(/_/g, " ")}
                    </Badge>
                  </div>

                  {essay.prompt_text && (
                    <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                      {essay.prompt_text}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                    <span>
                      {wordCount} {essay.word_count_target ? `/ ${essay.word_count_target}` : ""} words
                    </span>
                    <span>v{essay.current_version_number}</span>
                    <span>Updated {formatDate(essay.updated_at)}</span>
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
