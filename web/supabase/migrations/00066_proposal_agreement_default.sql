-- Each firm chooses its standard agreement once; proposal conversion never
-- chooses a template or falls back to a policy-free proposal appendix.
ALTER TABLE agreement_templates
    ADD CONSTRAINT agreement_templates_id_firm_unique UNIQUE (id, firm_id);

ALTER TABLE firm_settings ADD COLUMN proposal_agreement_template_id uuid;
ALTER TABLE firm_settings
    ADD CONSTRAINT firm_settings_proposal_agreement_template_fkey
    FOREIGN KEY (proposal_agreement_template_id, firm_id)
    REFERENCES agreement_templates (id, firm_id)
    ON DELETE SET NULL (proposal_agreement_template_id);

CREATE INDEX idx_firm_settings_proposal_agreement_template
    ON firm_settings (proposal_agreement_template_id, firm_id)
    WHERE proposal_agreement_template_id IS NOT NULL;

COMMENT ON COLUMN firm_settings.proposal_agreement_template_id IS
    'Standard firm agreement used when preparing an agreement from an accepted proposal. Existing tenant and staff-write RLS applies; the composite foreign key prevents cross-firm defaults.';
