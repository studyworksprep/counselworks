"use client";

import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";

export default function MessagesPage() {
  return (
    <PageShell
      title="Messages"
      description="Communicate with students, parents, and staff"
      actions={<Button>New Conversation</Button>}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12" style={{ minHeight: "calc(100vh - 200px)" }}>
        {/* Thread List */}
        <div className="lg:col-span-4">
          <Card className="h-full">
            <div className="border-b border-gray-200 p-4">
              <Input placeholder="Search conversations..." />
            </div>
            <CardContent>
              <EmptyState
                title="No conversations"
                description="Start a new conversation to message students, parents, or staff."
              />
            </CardContent>
          </Card>
        </div>

        {/* Active Conversation */}
        <div className="lg:col-span-5">
          <Card className="flex h-full items-center justify-center">
            <CardContent>
              <p className="text-center text-sm text-gray-500">
                Select a conversation to view messages
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardContent>
              <p className="text-center text-sm text-gray-500">
                Conversation details will appear here
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
