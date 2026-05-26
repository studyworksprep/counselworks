import Link from "next/link";
import {
  getWorkflowTemplates,
  type WorkflowTemplateRow,
} from "@/lib/db/queries";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const GRADE_GROUPS: { key: string; label: string }[] = [
  { key: "freshman", label: "9th Grade · Freshman" },
  { key: "sophomore", label: "10th Grade · Sophomore" },
  { key: "junior", label: "11th Grade · Junior" },
  { key: "senior", label: "12th Grade · Senior" },
  { key: "any", label: "Anytime" },
  { key: "_unsorted", label: "Other" },
];

interface Props {
  searchParams: Promise<{ category?: string }>;
}

export default async function WorkflowsPage({ searchParams }: Props) {
  const params = await searchParams;
  const templates = await getWorkflowTemplates({ category: params.category });

  // Group by grade level so the page reads as a high-school timeline rather
  // than a flat firm/system split.
  const grouped = new Map<string, WorkflowTemplateRow[]>();
  for (const t of templates) {
    const key = t.grade_level ?? "_unsorted";
    const list = grouped.get(key) ?? [];
    list.push(t);
    grouped.set(key, list);
  }

  return (
    <PageShell
      title="Workflows"
      description="Reusable plans you can apply to a student's college process. Per-grade anchors handle the date-locked items; discretionary and per-college templates run when the counselor decides the student is ready."
      actions={
        <Link href="/workflows/new">
          <Button>New Template</Button>
        </Link>
      }
    >
      {templates.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <h3 className="text-lg font-semibold text-gray-900">
            No workflow templates yet
          </h3>
          <p className="mt-1 text-sm text-gray-500 max-w-sm">
            Create a template to standardize how you guide students through a
            phase of the process.
          </p>
          <Link href="/workflows/new" className="mt-4">
            <Button>New Template</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-8">
          {GRADE_GROUPS.map((group) => {
            const list = grouped.get(group.key);
            if (!list || list.length === 0) return null;
            return (
              <TemplateGrid
                key={group.key}
                title={group.label}
                templates={list}
              />
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

function TemplateGrid({
  title,
  templates,
}: {
  title: string;
  templates: WorkflowTemplateRow[];
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wide">
        {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <Link key={t.id} href={`/workflows/${t.id}`} className="block">
            <Card className="h-full p-5 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-gray-900">{t.name}</h3>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-1">
                  {!t.is_active && <Badge variant="default">Archived</Badge>}
                  {t.is_system_template && <Badge variant="primary">System</Badge>}
                  {t.instantiation_scope === "student_college" && (
                    <Badge variant="warning">Per-college</Badge>
                  )}
                </div>
              </div>
              {t.description && (
                <p className="mt-2 text-sm text-gray-600 line-clamp-3">
                  {t.description}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                {t.category && <Badge variant="default">{t.category}</Badge>}
                <span>{t.step_count} step{t.step_count === 1 ? "" : "s"}</span>
                {t.active_workflow_count > 0 && (
                  <span>· {t.active_workflow_count} active</span>
                )}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
