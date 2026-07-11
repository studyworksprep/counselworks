import { redirect } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getStudentEssays } from "@/lib/db/queries";
import { formatDate } from "@/lib/utils";
import {
  ESSAY_STATUS_PORTAL_LABELS,
  ESSAY_STATUS_BADGES,
  ESSAY_TYPE_LABELS,
  resolveWordLimit,
} from "@/lib/constants/essays";

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
              No essays yet. Your counselor will set up essay drafts for you,
              and they&apos;ll appear here ready to write.
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
                        <Link
                          href={`/student-essays/${essay.id}`}
                          className="hover:text-primary-600"
                        >
                          {essay.title || ESSAY_TYPE_LABELS[essay.essay_type] || essay.essay_type}
                        </Link>
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {ESSAY_TYPE_LABELS[essay.essay_type] ?? essay.essay_type}
                        {essay.title && ESSAY_TYPE_LABELS[essay.essay_type]
                          ? ` · ${ESSAY_TYPE_LABELS[essay.essay_type]}`
                          : ""}
                      </p>
                    </div>
                    <Badge variant={ESSAY_STATUS_BADGES[essay.status] ?? "default"}>
                      {ESSAY_STATUS_PORTAL_LABELS[essay.status] ?? essay.status}
                    </Badge>
                  </div>

                  {essay.prompt_text && (
                    <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                      {essay.prompt_text}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                    <span>
                      {wordCount}
                      {resolveWordLimit(essay) ? ` / ${resolveWordLimit(essay)}` : ""}{" "}
                      words
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
