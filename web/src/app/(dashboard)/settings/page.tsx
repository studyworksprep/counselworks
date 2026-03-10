"use client";

import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SettingsPage() {
  return (
    <PageShell title="Settings" description="Manage your firm settings">
      <div className="max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Firm Profile</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Input label="Firm Name" placeholder="Your firm name" />
              <Input label="Firm Slug" placeholder="your-firm-slug" />
              <Button>Save Changes</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Staff Management</h3>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Manage staff members and their roles.
              </p>
              <Button size="sm">Invite Staff</Button>
            </div>
            <p className="text-sm text-gray-500">
              No staff members yet. Invite counselors, essay coaches, and tutors to your firm.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Branding</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Input label="Logo URL" placeholder="https://..." />
              <Input
                label="Primary Color"
                type="color"
                defaultValue="#2563eb"
                className="h-10 w-20"
              />
              <Button>Update Branding</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Data Management</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Button variant="outline">Export All Data</Button>
              <p className="text-xs text-gray-500">
                Export all firm data as a downloadable archive.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
