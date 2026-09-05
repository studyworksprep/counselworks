-- ===========================================================================
-- Secure signing links (fix plan 12.7): sign & pay without a portal account
-- ===========================================================================
-- An agreement is addressed to one household recipient (the family's
-- primary contact, or first parent/guardian). At send time the firm mints a
-- secret 48-hex token whose URL (/sign/<token>) lets that recipient review,
-- sign, and later pay the agreement's invoices with no login — the same
-- trust model as any e-signature link. Every family member already has a
-- users row (a placeholder until they claim an account), so the signature
-- and payments recorded through the link carry the recipient's user id and
-- follow them into the portal if the firm invites them later. The token is
-- revoked on void and rotated on resend; it has no fixed expiry because the
-- pay link must outlive a months-long installment schedule.
ALTER TABLE service_agreements
    ADD COLUMN signing_token text UNIQUE
        CHECK (signing_token IS NULL OR signing_token ~ '^[a-f0-9]{48}$'),
    ADD COLUMN signing_recipient_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN signing_link_sent_at timestamptz;
