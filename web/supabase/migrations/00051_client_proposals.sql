-- ===========================================================================
-- Client proposals: prospect → approval → service agreement
-- ===========================================================================
-- A counselor writes a proposal for a PROSPECTIVE client (no family record
-- exists yet): who it is for, what is offered, the price and discount, a
-- payment structure, optional included test-preparation lessons, and terms.
-- Sending it mints a secret 48-hex token whose URL (/proposal/<token>) lets
-- the prospect review and approve with no login — the same trust model as
-- the agreement signing link (00039). An approved proposal is frozen and
-- can be turned into a service agreement through the existing agreement
-- flow (00023/00035): its payment schedule becomes the agreement's
-- installment rows and its terms are embedded in the signed text.
--
-- Audience decision (CLAUDE.md DoD rule 3): proposals are STAFF-ONLY rows —
-- there is deliberately no visibility_scope column. The prospect reaches
-- their own proposal only through its token; once they are a client, the
-- accepted terms live in the agreement they sign, which is what the family
-- portal shows. Students never see pricing (same decision as billing).
-- All money is integer cents, USD.

CREATE TABLE proposals (
    id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id                       uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    -- Values defined once in src/lib/constants/proposals.ts. "Expired" is
    -- derived from valid_until in the app layer, never stored.
    status                        text NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft', 'sent', 'approved', 'withdrawn')),

    -- The prospective client, as typed by the counselor.
    parent_first_name             text NOT NULL,
    parent_last_name              text NOT NULL,
    parent_email                  text NOT NULL,
    student_first_name            text NOT NULL,
    student_last_name             text NOT NULL,
    graduation_year               int  NOT NULL,

    -- What is being offered. Text fields are light markdown in the
    -- agreement subset and are rendered as text nodes only.
    title                         text NOT NULL,
    intro_message                 text,
    services_summary              text NOT NULL,

    -- Pricing. The percent is a label for the two amounts; the app refuses
    -- a triple that disagrees (src/lib/proposals/pricing.ts).
    total_cost_cents              int NOT NULL CHECK (total_cost_cents > 0),
    discount_percent              numeric(5,2) NOT NULL DEFAULT 0
                                  CHECK (discount_percent >= 0 AND discount_percent < 100),
    discounted_cost_cents         int NOT NULL CHECK (discounted_cost_cents > 0),

    -- Payment structure: the chosen option, the inputs that option needs
    -- (so an edit form can default every field), and the resolved lines.
    payment_structure             text NOT NULL
                                  CHECK (payment_structure IN
                                         ('half_half', 'deposit_monthly', 'deposit_quarterly', 'custom')),
    deposit_cents                 int CHECK (deposit_cents > 0),
    installment_count             int CHECK (installment_count BETWEEN 1 AND 36),
    -- half_half: the date the second half is due by.
    -- deposit_*: the first installment date.
    first_due_on                  date,
    -- Array of {installment_number, label, amount_cents, is_retainer,
    -- due_on} — the agreement_installments shape, so conversion is a copy.
    payment_schedule_json         jsonb NOT NULL
                                  CHECK (jsonb_typeof(payment_schedule_json) = 'array'
                                         AND jsonb_array_length(payment_schedule_json) > 0),

    -- Optional included test-preparation lesson pack, and the price of each
    -- additional session once the pack is used.
    test_prep_lessons             int CHECK (test_prep_lessons > 0),
    additional_session_rate_cents int CHECK (additional_session_rate_cents > 0),

    terms_and_conditions          text,
    -- Last firm-local calendar day the proposal can be approved from the link.
    valid_until                   date NOT NULL,

    -- Public link: minted on first send, revoked (NULL) on withdraw.
    public_token                  text UNIQUE
                                  CHECK (public_token IS NULL OR public_token ~ '^[a-f0-9]{48}$'),
    sent_at                       timestamptz,

    -- Approval: the client's typed name (via = 'link'), or the staff member
    -- who recorded an approval given off-line (via = 'staff').
    approved_at                   timestamptz,
    approved_by_name              text,
    approved_via                  text CHECK (approved_via IN ('link', 'staff')),
    withdrawn_at                  timestamptz,

    -- Conversion: the household this prospect became (or already was), and
    -- the service agreement that carries the accepted terms.
    family_id                     uuid REFERENCES families(id) ON DELETE SET NULL,
    agreement_id                  uuid REFERENCES service_agreements(id) ON DELETE SET NULL,

    -- The author: scoped counselors see only their own proposals, the public
    -- page names them as the contact, and approvals notify them.
    created_by_user_id            uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at                    timestamptz NOT NULL DEFAULT now(),
    updated_at                    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT proposals_discount_within_total
        CHECK (discounted_cost_cents <= total_cost_cents),
    CONSTRAINT proposals_deposit_below_cost
        CHECK (deposit_cents IS NULL OR deposit_cents < discounted_cost_cents),
    -- A rate without a pack is a half-entered term.
    CONSTRAINT proposals_session_rate_needs_lessons
        CHECK (additional_session_rate_cents IS NULL OR test_prep_lessons IS NOT NULL),
    -- Each structure stores exactly its own inputs, never a stale one.
    CONSTRAINT proposals_structure_inputs CHECK (
        (payment_structure = 'half_half'
            AND first_due_on IS NOT NULL
            AND deposit_cents IS NULL AND installment_count IS NULL)
        OR (payment_structure IN ('deposit_monthly', 'deposit_quarterly')
            AND deposit_cents IS NOT NULL AND installment_count IS NOT NULL
            AND first_due_on IS NOT NULL)
        OR (payment_structure = 'custom'
            AND deposit_cents IS NULL AND installment_count IS NULL
            AND first_due_on IS NULL)
    ),
    -- A link exists exactly while the proposal is out with the client.
    CONSTRAINT proposals_link_matches_status CHECK (
        (status IN ('draft', 'withdrawn') AND public_token IS NULL)
        OR (status IN ('sent', 'approved')
            AND public_token IS NOT NULL AND sent_at IS NOT NULL)
    ),
    -- Approval evidence is all-or-nothing, and an approved row has it.
    CONSTRAINT proposals_approval_evidence CHECK (
        (approved_at IS NULL AND approved_by_name IS NULL AND approved_via IS NULL)
        OR (approved_at IS NOT NULL AND approved_by_name IS NOT NULL
            AND approved_via IS NOT NULL)
    ),
    CONSTRAINT proposals_approved_has_evidence
        CHECK (status <> 'approved' OR approved_at IS NOT NULL),
    CONSTRAINT proposals_withdrawn_has_timestamp
        CHECK (status <> 'withdrawn' OR withdrawn_at IS NOT NULL)
);

CREATE INDEX idx_proposals_firm_id ON proposals(firm_id);
-- The staff list: a scoped counselor's own proposals, newest first.
CREATE INDEX idx_proposals_firm_author
    ON proposals(firm_id, created_by_user_id, created_at DESC);
CREATE INDEX idx_proposals_family_id
    ON proposals(family_id) WHERE family_id IS NOT NULL;
CREATE INDEX idx_proposals_agreement_id
    ON proposals(agreement_id) WHERE agreement_id IS NOT NULL;

CREATE TRIGGER trg_proposals_set_updated_at
    BEFORE UPDATE ON proposals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

-- Staff-only read AND write: a proposal holds a prospect's contact details
-- and negotiated pricing, and no portal role ever lists them. (Which staff
-- member may see which proposal — owners/admins all, counselors their own —
-- is app-layer: src/lib/auth/authorize.ts#requireProposalAccess.) The
-- public page and its approve action use the service-role client with the
-- token as the credential; see docs/SECURITY.md.
CREATE POLICY proposals_staff_access ON proposals
    FOR ALL
    USING (firm_id = public.firm_id() AND public.is_staff())
    WITH CHECK (firm_id = public.firm_id() AND public.is_staff());
