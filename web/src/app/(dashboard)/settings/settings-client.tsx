"use client";

import { useState, useTransition } from "react";
import { format, parseISO } from "date-fns";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/modals/modal";
import { useRouter } from "next/navigation";
import {
  updateFirmProfile,
  updateBranding,
  updateMemberRole,
  removeMember,
  inviteStaffMember,
  updateRoundDeadlineDefaults,
} from "@/lib/actions/settings";
import {
  APPLICATION_ROUNDS,
  DEFAULT_ROUND_ANCHORS,
  parseRoundAnchorOverrides,
} from "@/lib/constants/applications";
import {
  saveAgreementTemplate,
  updateAgreementGating,
} from "@/lib/actions/agreements";
import { NotificationPrefsCard } from "@/components/notifications/prefs-card";
import type { NotificationPrefs } from "@/lib/notifications/prefs";
import { Textarea } from "@/components/ui/textarea";

interface AgreementTemplateRow {
  id: string;
  name: string;
  body: string;
}

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
    round_deadline_defaults_json?: unknown;
    require_signed_agreement?: boolean;
  } | null;
  role: string;
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

const ADMIN_ROLES = new Set(["firm_owner", "firm_admin"]);

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
                  ? "bg-danger-50 text-danger-700"
                  : "bg-success-50 text-success-700"
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
          <Button type="submit" loading={isPending}>
            Save Changes
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Invite Staff Modal
// ---------------------------------------------------------------------------
function InviteStaffModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await inviteStaffMember(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 1500);
      }
    });
  }

  function handleClose() {
    setError(null);
    setSuccess(false);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Invite Staff Member"
      description="Add a new counselor, coach, or tutor to your firm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert>{error}</Alert>
        )}
        {success && (
          <div className="rounded-md bg-success-50 p-3 text-sm text-success-700">
            Staff member added successfully!
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input name="first_name" label="First Name" placeholder="Jane" required />
          <Input name="last_name" label="Last Name" placeholder="Smith" required />
        </div>

        <Input name="email" label="Email" type="email" placeholder="jane@example.com" required />

        <Select
          name="role"
          label="Role"
          required
          options={[
            { value: "counselor", label: "Counselor" },
            { value: "firm_admin", label: "Admin" },
            { value: "essay_coach", label: "Essay Coach" },
            { value: "tutor", label: "Tutor" },
            { value: "read_only_staff", label: "Read-Only Staff" },
          ]}
        />

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isPending || success}>
            {isPending ? "Adding..." : "Add Staff Member"}
          </Button>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Staff Section
// ---------------------------------------------------------------------------
function StaffSection({ members, role }: { members: FirmData["members"]; role: string }) {
  const isOwner = role === "firm_owner";
  const [, startTransition] = useTransition();
  const [showInvite, setShowInvite] = useState(false);

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
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {activeMembers.length} member{activeMembers.length !== 1 && "s"}
            </span>
            <Button size="sm" onClick={() => setShowInvite(true)}>
              Add Staff
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {activeMembers.length === 0 ? (
          <p className="text-sm text-gray-500">
            No staff members yet. Add your first team member to get started.
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
                  {isOwner ? (
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.id, e.target.value)}
                      className="rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="firm_owner">Owner</option>
                      <option value="firm_admin">Admin</option>
                      <option value="counselor">Counselor</option>
                      <option value="essay_coach">Essay Coach</option>
                      <option value="tutor">Tutor</option>
                      <option value="read_only_staff">Read-Only</option>
                    </select>
                  ) : (
                    <Badge variant={roleVariant[m.role] ?? "default"}>
                      {m.role.replace(/_/g, " ")}
                    </Badge>
                  )}
                  {isOwner && (
                    <button
                      onClick={() => handleRemove(m.id)}
                      className="text-xs text-gray-400 hover:text-danger-500"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <InviteStaffModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
      />
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
                  ? "bg-danger-50 text-danger-700"
                  : "bg-success-50 text-success-700"
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
          <Button type="submit" loading={isPending}>
            Update Branding
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Round deadline defaults (fix plan 8.7)
// ---------------------------------------------------------------------------
function DeadlineDefaultsSection({
  settings,
}: {
  settings: FirmData["settings"];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const overrides = parseRoundAnchorOverrides(
    settings?.round_deadline_defaults_json
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateRoundDeadlineDefaults(formData);
      if (result.error) setError(result.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold text-gray-900">
          Application Deadline Defaults
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Applications created without an explicit deadline anchor to these
          month/day defaults for the student&apos;s class year. Every date
          stays editable per application.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <Alert>{error}</Alert>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            {APPLICATION_ROUNDS.map((round) => {
              const current =
                overrides[round.value] ??
                DEFAULT_ROUND_ANCHORS[round.value] ??
                null;
              return (
                <div key={round.value}>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    {round.label}
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      name={`${round.value}_month`}
                      min={1}
                      max={12}
                      defaultValue={current?.month ?? ""}
                      placeholder="MM"
                      aria-label={`${round.label} month`}
                      className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    />
                    <span className="text-gray-400">/</span>
                    <input
                      type="number"
                      name={`${round.value}_day`}
                      min={1}
                      max={31}
                      defaultValue={current?.day ?? ""}
                      placeholder="DD"
                      aria-label={`${round.label} day`}
                      className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" loading={isPending}>
              Save Defaults
            </Button>
            {saved && (
              <span className="text-sm text-success-700">Saved</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Service agreements (fix plan 10.1)
// ---------------------------------------------------------------------------
function AgreementsSection({
  templates,
  requireSigned,
}: {
  templates: AgreementTemplateRow[];
  requireSigned: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AgreementTemplateRow | null>(null);
  const [creating, setCreating] = useState(templates.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await saveAgreementTemplate(formData);
      if (result.error) setError(result.error);
      else {
        setEditing(null);
        setCreating(false);
        router.refresh();
      }
    });
  }

  function handleGating(e: React.ChangeEvent<HTMLInputElement>) {
    const formData = new FormData();
    if (e.target.checked) formData.set("require_signed_agreement", "on");
    startTransition(async () => {
      await updateAgreementGating(formData);
      router.refresh();
    });
  }

  const active = editing ?? (creating ? { id: "", name: "", body: "" } : null);

  return (
    <Card>
      <CardHeader>
        <h3 className="font-semibold text-gray-900">Service Agreements</h3>
        <p className="mt-1 text-sm text-gray-500">
          The engagement letter families sign electronically during
          onboarding. Placeholders: {"{{family_name}}"}, {"{{firm_name}}"},{" "}
          {"{{date}}"}.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert>{error}</Alert>}

        {templates.length > 0 && (
          <ul className="space-y-2">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
              >
                <span className="text-sm font-medium text-gray-900">
                  {t.name}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCreating(false);
                    setEditing(t);
                  }}
                >
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        )}

        {!active && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            New template
          </Button>
        )}

        {active && (
          <form onSubmit={handleSave} className="space-y-3">
            {active.id && (
              <input type="hidden" name="template_id" value={active.id} />
            )}
            <Input
              name="name"
              label="Template name"
              required
              defaultValue={active.name}
              placeholder="e.g. Comprehensive Counseling Engagement"
            />
            <Textarea
              name="body"
              label="Agreement text"
              required
              rows={10}
              defaultValue={active.body}
              placeholder={
                "This agreement between {{firm_name}} and {{family_name}}, dated {{date}}…"
              }
            />
            <div className="flex gap-3">
              <Button type="submit" loading={isPending}>
                Save template
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setCreating(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}

        <label className="flex items-start gap-2 border-t border-gray-100 pt-4 text-sm text-gray-700">
          <input
            type="checkbox"
            defaultChecked={requireSigned}
            onChange={handleGating}
            className="mt-0.5 h-4 w-4 rounded border-gray-300"
          />
          <span>
            <span className="font-medium">
              Require a signed agreement before portal access.
            </span>{" "}
            Student and parent invitations stay blocked until the family has a
            fully executed agreement.
          </span>
        </label>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function SettingsClient({
  data,
  agreementTemplates = [],
  notificationPrefs,
}: {
  data: FirmData | null;
  agreementTemplates?: AgreementTemplateRow[];
  notificationPrefs?: NotificationPrefs;
}) {
  if (!data) {
    return (
      <PageShell title="Settings" description="Manage your firm settings">
        <p className="text-gray-500">Unable to load settings.</p>
      </PageShell>
    );
  }

  const isAdmin = ADMIN_ROLES.has(data.role);

  return (
    <PageShell title="Settings" description="Manage your firm settings">
      <div className="max-w-3xl space-y-6">
        {isAdmin && <ProfileSection firm={data.firm} />}
        {isAdmin && <StaffSection members={data.members} role={data.role} />}
        {isAdmin && <BrandingSection settings={data.settings} />}
        {isAdmin && <DeadlineDefaultsSection settings={data.settings} />}
        {isAdmin && (
          <AgreementsSection
            templates={agreementTemplates}
            requireSigned={data.settings?.require_signed_agreement ?? false}
          />
        )}
        {notificationPrefs && (
          <NotificationPrefsCard prefs={notificationPrefs} />
        )}
        {!isAdmin && (
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Your Account</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                Contact your firm administrator to update firm settings or manage
                staff.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
