import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getStudentByIdCached,
  getFamilyById,
  getFamilyAgreements,
  getFamilyInvoices,
} from "@/lib/db/queries";
import { InvoicesCard } from "@/components/billing/invoices-card";
import { formatDate } from "@/lib/utils";
import { formatCents } from "@/lib/agreements/schedule";

interface Props {
  params: Promise<{ id: string }>;
}

const AGREEMENT_BADGE: Record<string, "default" | "primary" | "warning" | "success" | "danger"> = {
  sent: "warning",
  partially_signed: "primary",
  completed: "success",
  voided: "default",
};
const AGREEMENT_LABEL: Record<string, string> = {
  sent: "Awaiting signatures",
  partially_signed: "Partially signed",
  completed: "Fully executed",
  voided: "Voided",
};

/**
 * Family & Billing (fix plan 13.0): the household this student belongs to,
 * as seen from the student — members and portal state, the engagement
 * agreement's status, and the invoices. Deliberately read-only here:
 * invoices belong to the family, not the student, so sending agreements,
 * inviting members, and remediation stay on the family page (linked).
 */
export default async function StudentFamilyPage({ params }: Props) {
  const { id } = await params;
  const student = await getStudentByIdCached(id);
  if (!student) return notFound();

  if (!student.family_id) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-gray-500">
            This student isn&apos;t linked to a family yet. Edit the student to
            set their household.
          </p>
        </CardContent>
      </Card>
    );
  }

  const [family, agreements, invoices] = await Promise.all([
    getFamilyById(student.family_id),
    getFamilyAgreements(student.family_id),
    getFamilyInvoices(student.family_id),
  ]);
  if (!family) return notFound();

  interface MemberRow {
    id: string;
    relationship_type: string;
    is_primary_contact: boolean;
    portal_status: "active" | "pending" | "none";
    users: { first_name: string; last_name: string; email: string };
  }
  const members = family.members as MemberRow[];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-5">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">{family.household_name}</h3>
              <Link
                href={`/families/${family.id}`}
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                Open family page
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <p className="text-sm text-gray-500">No family members yet.</p>
            ) : (
              <ul className="space-y-2">
                {members.map((m) => {
                  const u = m.users;
                  return (
                    <li key={m.id} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium text-gray-900">
                          {u ? `${u.first_name} ${u.last_name}` : "Member"}
                          {m.is_primary_contact && (
                            <span className="ml-2 text-xs text-gray-500">Primary contact</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          {m.relationship_type}
                          {u?.email && ` · ${u.email}`}
                        </p>
                      </div>
                      <Badge
                        variant={
                          m.portal_status === "active"
                            ? "success"
                            : m.portal_status === "pending"
                              ? "warning"
                              : "default"
                        }
                      >
                        {m.portal_status === "active"
                          ? "Portal active"
                          : m.portal_status === "pending"
                            ? "Invite pending"
                            : "No portal"}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
              Members and portal invitations are managed on the family page;
              agreements and invoices on its Billing page.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-900">Service Agreement</h3>
          </CardHeader>
          <CardContent>
            {agreements.length === 0 ? (
              <p className="text-sm text-gray-500">
                No agreement sent yet.{" "}
                <Link
                  href={`/families/${family.id}/billing`}
                  className="text-primary-600 hover:text-primary-700"
                >
                  Send one from the family&apos;s Billing page.
                </Link>
              </p>
            ) : (
              <ul className="space-y-3">
                {agreements.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900">{a.title}</p>
                      <p className="text-xs text-gray-500">
                        Sent {formatDate(a.sent_at)}
                        {a.completed_at && ` · executed ${formatDate(a.completed_at)}`}
                        {a.total_fee_cents !== null &&
                          ` · ${formatCents(a.total_fee_cents)}`}
                      </p>
                    </div>
                    <Badge variant={AGREEMENT_BADGE[a.status] ?? "default"}>
                      {AGREEMENT_LABEL[a.status] ?? a.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6 lg:col-span-7">
        {invoices.length > 0 ? (
          <InvoicesCard invoices={invoices} />
        ) : (
          <Card>
            <CardHeader>
              <h3 className="font-semibold text-gray-900">Invoices</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                Invoices are generated when an agreement with fee terms is fully
                executed.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
