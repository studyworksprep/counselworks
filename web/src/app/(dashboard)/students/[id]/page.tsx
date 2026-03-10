"use client";

import { useParams } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { StatCard } from "@/components/cards/stat-card";

export default function StudentDetailPage() {
  const params = useParams();
  const studentId = params.id as string;

  return (
    <PageShell
      title="Student Detail"
      description="View and manage student information"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            Add Note
          </Button>
          <Button variant="outline" size="sm">
            Add Task
          </Button>
          <Button variant="outline" size="sm">
            Message
          </Button>
          <Button size="sm">Edit</Button>
        </div>
      }
    >
      {/* Student Header */}
      <div className="mb-6 flex items-start gap-6">
        <Avatar firstName="Student" lastName="Name" size="lg" />
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">
              Student Name
            </h2>
            <Badge variant="success">Active</Badge>
          </div>
          <p className="text-sm text-gray-500">
            Class of 2027 &middot; School Name &middot; ID: {studentId}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-8">
        <StatCard title="Next Deadline" value="--" />
        <StatCard title="Overdue Tasks" value={0} />
        <StatCard title="Applications" value={0} />
        <StatCard title="Essays" value={0} />
        <StatCard title="Unread Messages" value={0} />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column */}
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Upcoming Tasks</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">No upcoming tasks.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Recent Meetings</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">No meetings recorded.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Recent Notes</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">No notes yet.</p>
            </CardContent>
          </Card>
        </div>

        {/* Center Column */}
        <div className="lg:col-span-6 space-y-6">
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">College List</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                No colleges added to list. Start building the college list to track applications.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Application Tracker</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                Applications will appear here once colleges are added.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Essays</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">No essay drafts yet.</p>
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Family Contacts</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">No family contacts linked.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Academic Snapshot</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">GPA (UW)</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">GPA (W)</span>
                  <span className="font-medium">--</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Class Rank</span>
                  <span className="font-medium">--</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Staff Assignments</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">No staff assigned.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Missing Items</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">No alerts.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
