"use client";

import { useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  updateFirmProfile,
  updateBranding,
  updateMemberRole,
  removeMember,
} from "@/lib/actions/settings";

interface FirmData {
  firm: {
    id: string;
    name: string;
    slug: string;
    status: string;
    plan_type: string;
  } | null;
  settings: {
    branding_logo_url: string | null;
    primary_color: string | null;
  } | null;
  members: {
    id: string;
    role: string;
    status: string;
    joined_at: string | null;
    user_id: string;
    name: string;
    email: string;
  }[];
}

const roleVariant: Record<string, "primary" | "warning" | "default"> = {
  firm_owner: "primary",
  admin: "warning",
  counselor: "default",
  essay_coach: "default",
  tutor: "default",
};

// ---------------------------------------------------------------------------
// Profile Section
// ---------------------------------------------------------------------------
function ProfileSection({ firm }: { firm: FirmData["firm"] }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateFirmProfile(formData);
      setMessage(result.error ?? "Saved successfully");
    });
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold text-gray-900">Firm Profile</h3>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {message && (
            <div
              className={`rounded-md p-3 text-sm ${
                message.includes("error") || message.includes("Failed")
                  ? "bg-red-50 text-red-700"
                  : "bg-green-50 text-green-700"
              }`}
            >
              {message}
            </div>
          )}
          <Input
            name="name"
            label="Firm Name"
            defaultValue={firm?.name ?? ""}
            required
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Slug
            </label>
            <p className="text-sm text-gray-500">{firm?.slug}</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="primary">{firm?.plan_type ?? "free"}</Badge>
            <Badge variant="default">{firm?.status ?? "active"}</Badge>
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Staff Section
// ---------------------------------------------------------------------------
function StaffSection({ members }: { members: FirmData["members"] }) {
  const [, startTransition] = useTransition();

  function handleRoleChange(membershipId: string, role: string) {
    startTransition(async () => {
      await updateMemberRole(membershipId, role);
    });
  }

  function handleRemove(membershipId: string) {
    startTransition(async () => {
      await removeMember(membershipId);
    });
  }

  const activeMembers = members.filter((m) => m.status === "active");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Staff Management</h3>
          <span className="text-sm text-gray-500">
            {activeMembers.length} member{activeMembers.length !== 1 && "s"}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {activeMembers.length === 0 ? (
          <p className="text-sm text-gray-500">
            No staff members yet.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {activeMembers.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{m.name}</p>
                  <p className="text-xs text-gray-500">{m.email}</p>
                  {m.joined_at && (
                    <p className="text-xs text-gray-400">
                      Joined {format(parseISO(m.joined_at), "MMM d, yyyy")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.id, e.target.value)}
                    className="rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="firm_owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="counselor">Counselor</option>
                    <option value="essay_coach">Essay Coach</option>
                    <option value="tutor">Tutor</option>
                  </select>
                  <button
                    onClick={() => handleRemove(m.id)}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Branding Section
// ---------------------------------------------------------------------------
function BrandingSection({ settings }: { settings: FirmData["settings"] }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateBranding(formData);
      setMessage(result.error ?? "Saved successfully");
    });
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold text-gray-900">Branding</h3>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {message && (
            <div
              className={`rounded-md p-3 text-sm ${
                message.includes("error") || message.includes("Failed")
                  ? "bg-red-50 text-red-700"
                  : "bg-green-50 text-green-700"
              }`}
            >
              {message}
            </div>
          )}
          <Input
            name="logo_url"
            label="Logo URL"
            placeholder="https://..."
            defaultValue={settings?.branding_logo_url ?? ""}
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Primary Color
            </label>
            <input
              name="primary_color"
              type="color"
              defaultValue={settings?.primary_color ?? "#2563eb"}
              className="h-10 w-20 cursor-pointer rounded border border-gray-300"
            />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Update Branding"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function SettingsClient({ data }: { data: FirmData | null }) {
  if (!data) {
    return (
      <PageShell title="Settings" description="Manage your firm settings">
        <p className="text-gray-500">Unable to load settings.</p>
      </PageShell>
    );
  }

  return (
    <PageShell title="Settings" description="Manage your firm settings">
      <div className="max-w-3xl space-y-6">
        <ProfileSection firm={data.firm} />
        <StaffSection members={data.members} />
        <BrandingSection settings={data.settings} />
      </div>
    </PageShell>
  );
}
