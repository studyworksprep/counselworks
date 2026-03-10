"use client";

import { useState } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

const stages = [
  { key: "not_started", label: "Not Started", color: "bg-gray-100" },
  { key: "in_progress", label: "In Progress", color: "bg-primary-50" },
  { key: "submitted", label: "Submitted", color: "bg-warning-50" },
  { key: "under_review", label: "Under Review", color: "bg-purple-50" },
  { key: "decision_received", label: "Decision Received", color: "bg-success-50" },
];

interface ApplicationCard {
  id: string;
  student_name: string;
  college_name: string;
  stage: string;
  deadline: string | null;
  round_type: string | null;
}

export default function ApplicationsPage() {
  const [search, setSearch] = useState("");
  const [counselorFilter, setCounselorFilter] = useState("");

  const applications: ApplicationCard[] = [];

  return (
    <PageShell
      title="Applications"
      description="Track application progress across all students"
    >
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Input
          placeholder="Search applications..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select
          placeholder="All counselors"
          value={counselorFilter}
          onChange={(e) => setCounselorFilter(e.target.value)}
          options={[]}
          className="w-44"
        />
      </div>

      {applications.length === 0 ? (
        <Card>
          <EmptyState
            title="No applications yet"
            description="Applications will appear here once students add colleges to their lists and begin the application process."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {stages.map((stage) => (
            <div key={stage.key}>
              <div className="mb-3 flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-700">
                  {stage.label}
                </h3>
                <Badge variant="default">
                  {
                    applications.filter((a) => a.stage === stage.key)
                      .length
                  }
                </Badge>
              </div>
              <div className="space-y-3">
                {applications
                  .filter((a) => a.stage === stage.key)
                  .map((app) => (
                    <Card key={app.id} className={stage.color}>
                      <CardContent>
                        <p className="font-medium text-gray-900 text-sm">
                          {app.college_name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {app.student_name}
                        </p>
                        {app.deadline && (
                          <p className="mt-1 text-xs text-gray-500">
                            Due: {app.deadline}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
