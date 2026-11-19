/**
 * Family dashboard view model (parent portal rework). Pure functions over
 * rows the existing portal queries already return, so the rules for "what
 * needs a parent's attention" and "where each child stands" are unit-tested
 * (tests/unit/family-dashboard.test.ts) instead of living inline in JSX.
 *
 * Visibility is decided upstream: every input comes from a parent-scoped
 * query (getPortalInvoices, getPortalAgreements, getParentTasks,
 * getParentOpenDocumentRequests, getFamilyProgressData), which filter by the
 * household and by family/firm visibility. Nothing here widens that.
 *
 * Dates: `today` is the firm's calendar date (`YYYY-MM-DD`, from
 * getBillingTodayIso). Calendar values are compared as strings on their
 * first ten characters, so a UTC-midnight timestamp (applications.deadline_at,
 * document_requests.due_at) never shifts a day with the server's timezone.
 */
import { isInvoiceOverdue } from "@/lib/billing/invoices";
import { TASK_OPEN_STATUSES, TASK_STATUS_LABELS } from "@/lib/constants/tasks";
import { PIPELINE_STAGES } from "@/lib/constants/applications";

/** Open invoices due within this many days count as "coming up". */
export const UPCOMING_PAYMENT_DAYS = 30;

/** Parent tasks listed on the dashboard; the rest are one tap away. */
export const ATTENTION_TASK_LIMIT = 5;

export type AttentionKind = "payment" | "agreement" | "document" | "task";

export interface AttentionItem {
  key: string;
  kind: AttentionKind;
  title: string;
  detail: string;
  /** Where the item's action (or, for tasks, its title) goes. */
  href: string;
  overdue: boolean;
  /** Tasks only: the parent can finish it in one step (simple completion). */
  taskId?: string;
  canComplete?: boolean;
}

export interface AttentionInvoice {
  id: string;
  invoice_number: string;
  label: string;
  status: string;
  due_on: string;
  balance_cents: number;
}

export interface AttentionAgreement {
  id: string;
  title: string;
  status: string;
  signed_roles: string[];
}

export interface AttentionDocumentRequest {
  id: string;
  title: string;
  due_at: string | null;
  student_name: string | null;
  requested_by: string;
}

export interface AttentionTask {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  due_on: string | null;
  dependency_blocked?: boolean | null;
  isMine: boolean;
  canComplete: boolean;
  students?: unknown;
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`); negative = past. */
export function daysBetween(from: string, to: string): number {
  const utc = (iso: string) =>
    Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((utc(to.slice(0, 10)) - utc(from.slice(0, 10))) / 86_400_000);
}

/**
 * An agreement is waiting on this household while it is out for signature
 * and the family role has not signed yet (the firm may sign first or last).
 */
export function awaitsFamilySignature(agreement: AttentionAgreement): boolean {
  return (
    (agreement.status === "sent" || agreement.status === "partially_signed") &&
    !agreement.signed_roles.includes("family")
  );
}

/**
 * A parent's own task they can act on now: assigned to them, open, not
 * sitting with a reviewer ("submitted"), and not waiting on a prerequisite.
 */
export function isActionableParentTask(task: AttentionTask): boolean {
  return (
    task.isMine &&
    TASK_OPEN_STATUSES.includes(task.status) &&
    task.status !== "submitted" &&
    !task.dependency_blocked
  );
}

export interface PaymentSummary {
  overdue_cents: number;
  upcoming_cents: number;
  /** Overdue first (oldest first), then upcoming by due date. */
  invoices: (AttentionInvoice & { overdue: boolean })[];
}

/**
 * Money a parent should act on: open balances already past due, plus open
 * balances due within UPCOMING_PAYMENT_DAYS. Installments months away stay
 * on the billing page; they are not "attention" yet.
 */
export function summarizePayments(
  invoices: AttentionInvoice[],
  today: string
): PaymentSummary | null {
  const due = invoices
    .filter((inv) => inv.status === "open" && inv.balance_cents > 0)
    .map((inv) => ({ ...inv, overdue: isInvoiceOverdue(inv, today) }))
    .filter((inv) => inv.overdue || daysBetween(today, inv.due_on) <= UPCOMING_PAYMENT_DAYS)
    .sort((a, b) => a.due_on.localeCompare(b.due_on));
  if (due.length === 0) return null;
  return {
    overdue_cents: due.filter((i) => i.overdue).reduce((s, i) => s + i.balance_cents, 0),
    upcoming_cents: due.filter((i) => !i.overdue).reduce((s, i) => s + i.balance_cents, 0),
    invoices: due,
  };
}

function studentFirstName(students: unknown): string | null {
  const s = (Array.isArray(students) ? students[0] : students) as
    | { first_name?: string }
    | null
    | undefined;
  return s?.first_name ?? null;
}

const KIND_ORDER: Record<AttentionKind, number> = {
  agreement: 0,
  payment: 1,
  document: 2,
  task: 3,
};

/**
 * Everything waiting on the signed-in parent, most pressing first: overdue
 * items lead, then agreements to sign, payments, document requests, and the
 * parent's own tasks. Copy is assembled by the page (it formats money and
 * dates); this decides membership and order and carries the raw facts.
 */
export function buildAttentionItems(input: {
  today: string;
  invoices: AttentionInvoice[];
  agreements: AttentionAgreement[];
  documentRequests: AttentionDocumentRequest[];
  tasks: AttentionTask[];
  formatDate: (value: string) => string;
  formatMoney: (cents: number) => string;
}): { items: AttentionItem[]; payments: PaymentSummary | null; hiddenTaskCount: number } {
  const { today, formatDate, formatMoney } = input;
  const items: AttentionItem[] = [];
  // Secondary sort key per item (a due day; undated sorts last).
  const sortDate = new Map<string, string>();
  const push = (item: AttentionItem, date: string) => {
    items.push(item);
    sortDate.set(item.key, date);
  };

  for (const agreement of input.agreements.filter(awaitsFamilySignature)) {
    push(
      {
        key: `agreement-${agreement.id}`,
        kind: "agreement",
        title: agreement.title,
        detail:
          agreement.status === "partially_signed"
            ? "Service agreement · your signature is the one still needed"
            : "Service agreement · waiting for your signature",
        href: `/family-agreements/${agreement.id}`,
        overdue: false,
      },
      ""
    );
  }

  const payments = summarizePayments(input.invoices, today);
  if (payments) {
    // "$3,000.00 overdue · $4,500.00 due by Dec 12": the upcoming date is
    // the last one in the window, so the sum is all owed by then.
    const upcoming = payments.invoices.filter((i) => !i.overdue);
    const parts: string[] = [];
    if (payments.overdue_cents > 0) parts.push(`${formatMoney(payments.overdue_cents)} overdue`);
    if (upcoming.length > 0) {
      parts.push(
        `${formatMoney(payments.upcoming_cents)} due ${upcoming.length > 1 ? "by " : ""}${formatDate(upcoming.at(-1)!.due_on)}`
      );
    }
    const first = payments.invoices[0];
    const more = payments.invoices.length - 1;
    push(
      {
        key: "payments",
        kind: "payment",
        title: parts.join(" · "),
        detail: `${first.invoice_number} · ${first.label} · ${first.overdue ? "was due" : "due"} ${formatDate(first.due_on)}${
          more > 0 ? ` · and ${more} more invoice${more === 1 ? "" : "s"}` : ""
        }`,
        href: "/family-billing",
        overdue: payments.overdue_cents > 0,
      },
      first.due_on
    );
  }

  for (const request of input.documentRequests) {
    const dueDay = request.due_at?.slice(0, 10) ?? null;
    const overdue = dueDay !== null && dueDay < today;
    const facts = [
      request.student_name ? `For ${request.student_name}` : null,
      `Requested by ${request.requested_by}`,
      dueDay ? `${overdue ? "was due" : "due"} ${formatDate(dueDay)}` : null,
    ].filter(Boolean);
    push(
      {
        key: `document-${request.id}`,
        kind: "document",
        title: request.title,
        detail: facts.join(" · "),
        href: `/family-documents#request-${request.id}`,
        overdue,
      },
      dueDay ?? "9999-12-31"
    );
  }

  const tasks = input.tasks.filter(isActionableParentTask).map((task) => {
    const dueDay = (task.due_on ?? task.due_at)?.slice(0, 10) ?? null;
    return { task, dueDay, overdue: dueDay !== null && dueDay < today };
  });
  tasks.sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      (a.dueDay ?? "9999-12-31").localeCompare(b.dueDay ?? "9999-12-31")
  );
  for (const { task, dueDay, overdue } of tasks.slice(0, ATTENTION_TASK_LIMIT)) {
    const name = studentFirstName(task.students);
    const facts = [
      name ? `Your task for ${name}` : "Your task",
      task.status === "changes_requested" ? TASK_STATUS_LABELS[task.status] : null,
      dueDay ? `${overdue ? "was due" : "due"} ${formatDate(dueDay)}` : null,
    ].filter(Boolean);
    push(
      {
        key: `task-${task.id}`,
        kind: "task",
        title: task.title,
        detail: facts.join(" · "),
        href: `/family-tasks/${task.id}`,
        overdue,
        taskId: task.id,
        canComplete: task.canComplete,
      },
      dueDay ?? "9999-12-31"
    );
  }

  items.sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      (sortDate.get(a.key) ?? "").localeCompare(sortDate.get(b.key) ?? "")
  );

  return {
    items,
    payments,
    hiddenTaskCount: Math.max(0, tasks.length - ATTENTION_TASK_LIMIT),
  };
}

export interface ChildApplication {
  id: string;
  college_name: string;
  application_type: string;
  stage: string;
  deadline_at: string | null;
  submitted_at: string | null;
  decision_result: string | null;
}

export interface ChildApplicationSummary {
  total: number;
  /** Non-empty stages in pipeline order, withdrawn last. */
  stages: { stage: string; count: number }[];
  decisions: ChildApplication[];
  nextDeadline: (ChildApplication & { daysAway: number }) | null;
}

const STAGE_ORDER = [...PIPELINE_STAGES.map((s) => s.value as string), "withdrawn"];

/** Where one child's applications stand, for the dashboard's child card. */
export function summarizeChildApplications(
  applications: ChildApplication[],
  today: string
): ChildApplicationSummary {
  const counts = new Map<string, number>();
  for (const app of applications) counts.set(app.stage, (counts.get(app.stage) ?? 0) + 1);
  const stages = [...counts.entries()]
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => {
      const ai = STAGE_ORDER.indexOf(a.stage);
      const bi = STAGE_ORDER.indexOf(b.stage);
      return (ai === -1 ? STAGE_ORDER.length : ai) - (bi === -1 ? STAGE_ORDER.length : bi);
    });

  const upcoming = applications
    .filter(
      (app) =>
        app.deadline_at &&
        !app.submitted_at &&
        (app.stage === "not_started" || app.stage === "in_progress") &&
        app.deadline_at.slice(0, 10) >= today
    )
    .sort((a, b) => a.deadline_at!.localeCompare(b.deadline_at!));

  return {
    total: applications.length,
    stages,
    decisions: applications.filter((app) => app.decision_result),
    nextDeadline: upcoming[0]
      ? { ...upcoming[0], daysAway: daysBetween(today, upcoming[0].deadline_at!) }
      : null,
  };
}
