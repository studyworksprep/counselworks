"use client";

import { useParams } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function FamilyDetailPage() {
  const params = useParams();
  const familyId = params.id as string;

  return (
    <PageShell
      title="Family Detail"
      description="View and manage family household information"
      actions={<Button size="sm">Edit Family</Button>}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Family Members</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                No family members linked. Add parents, guardians, or students to this household.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Students</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                No students in this household. Family ID: {familyId}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Notes</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">No notes for this family.</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Contact Information</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">No address on file.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Documents</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">No documents uploaded.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
