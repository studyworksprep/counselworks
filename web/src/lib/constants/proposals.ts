/**
 * Single source of truth for client-proposal enums (CLAUDE.md rule 4).
 * Imported by the proposal actions, the pure builders in src/lib/proposals,
 * the staff pages, the public page, and every label map — never respell
 * these values. The stored values match the CHECK constraints in migration
 * 00051.
 */

// ---------------------------------------------------------------------------
// Stored status
// ---------------------------------------------------------------------------
// draft     → being written; no public link exists yet
// sent      → emailed; the public link is live and can be approved
// approved  → the client (or staff, on their behalf) accepted the terms;
//             frozen from here on
// withdrawn → the firm revoked it; the public link is dead
// rejected  → the client declined with feedback; duplicate to revise
export const PROPOSAL_STATUSES = ["draft", "sent", "approved", "rejected", "withdrawn"] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/**
 * What a proposal row SHOWS. "expired" (sent, past its valid-through date)
 * and the two agreement states (derived from the linked service agreement)
 * are computed by `proposalDisplayStatus` and never written — the same
 * approach as invoice "overdue" / "partially paid".
 */
export const PROPOSAL_DISPLAY_STATUSES = [
  { value: "draft", label: "Draft", badge: "default" },
  { value: "sent", label: "Awaiting approval", badge: "warning" },
  { value: "expired", label: "Expired", badge: "danger" },
  { value: "approved", label: "Approved", badge: "success" },
  { value: "rejected", label: "Rejected", badge: "danger" },
  { value: "agreement_sent", label: "Agreement sent", badge: "primary" },
  { value: "agreement_completed", label: "Agreement signed", badge: "success" },
  { value: "withdrawn", label: "Withdrawn", badge: "default" },
] as const;

export type ProposalDisplayStatus =
  (typeof PROPOSAL_DISPLAY_STATUSES)[number]["value"];

export const PROPOSAL_DISPLAY_LABELS: Record<string, string> =
  Object.fromEntries(PROPOSAL_DISPLAY_STATUSES.map((s) => [s.value, s.label]));

type BadgeVariant = "default" | "primary" | "warning" | "success" | "danger";

export const PROPOSAL_DISPLAY_BADGES: Record<string, BadgeVariant> =
  Object.fromEntries(PROPOSAL_DISPLAY_STATUSES.map((s) => [s.value, s.badge]));

// ---------------------------------------------------------------------------
// Payment structure
// ---------------------------------------------------------------------------
// `frequency` reuses the engagement-billing cadence values
// (constants/billing.ts INSTALLMENT_FREQUENCIES) rather than respelling them.
export const PAYMENT_STRUCTURES = [
  {
    value: "half_half",
    label: "Half up front, half at the final application",
    description:
      "50% at signing. The other 50% when the final application is submitted, or on a set date (January 1 by default) — whichever comes first.",
    frequency: null,
  },
  {
    value: "deposit_monthly",
    label: "Deposit + monthly payments",
    description:
      "A deposit at signing, then the balance in equal monthly payments.",
    frequency: "monthly",
  },
  {
    value: "deposit_quarterly",
    label: "Deposit + quarterly payments",
    description:
      "A deposit at signing, then the balance in equal quarterly payments.",
    frequency: "quarterly",
  },
  {
    value: "custom",
    label: "Custom schedule",
    description: "Write each payment yourself: what it is, how much, and when.",
    frequency: null,
  },
] as const;

export type PaymentStructure = (typeof PAYMENT_STRUCTURES)[number]["value"];

export const PAYMENT_STRUCTURE_VALUES = PAYMENT_STRUCTURES.map(
  (s) => s.value
) as [PaymentStructure, ...PaymentStructure[]];

// ---------------------------------------------------------------------------
// How an approval was recorded
// ---------------------------------------------------------------------------
// link  → the client approved on the public page (their typed name is kept)
// staff → a staff member recorded an approval given by phone, email, or in
//         person (their own name is kept)
export const APPROVAL_SOURCES = ["link", "staff"] as const;

export type ApprovalSource = (typeof APPROVAL_SOURCES)[number];

// ---------------------------------------------------------------------------
// Limits (sanity caps — anything above is almost certainly a typo)
// ---------------------------------------------------------------------------
export const MAX_PROPOSAL_COST_CENTS = 100_000_000; // $1,000,000
export const MAX_TEST_PREP_LESSONS = 500;
export const MAX_SESSION_RATE_CENTS = 1_000_000; // $10,000 per session
/** New proposals default to a 30-day validity window. */
export const DEFAULT_VALIDITY_DAYS = 30;
export const MAX_PROPOSAL_FEEDBACK_LENGTH = 5000;
