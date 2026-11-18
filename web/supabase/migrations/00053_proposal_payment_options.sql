-- Offer multiple schedules without changing existing proposals or agreement billing.
-- NULL options means the existing single schedule. For new proposals the complete
-- offer is kept; legacy schedule columns become the client's selected schedule at
-- approval, so the agreement and installment paths keep using the approved terms.
ALTER TABLE public.proposals
  ADD COLUMN payment_options_json jsonb,
  ADD COLUMN selected_payment_structure text,
  ADD CONSTRAINT proposals_payment_options_array CHECK (
    payment_options_json IS NULL OR
    CASE WHEN jsonb_typeof(payment_options_json) = 'array'
      THEN jsonb_array_length(payment_options_json) BETWEEN 1 AND 4 ELSE false END
  ),
  ADD CONSTRAINT proposals_approved_payment_choice CHECK (
    payment_options_json IS NULL OR approved_at IS NULL OR selected_payment_structure IS NOT NULL
  ),
  ADD CONSTRAINT proposals_selected_payment_option CHECK (
    selected_payment_structure IS NULL OR (
      selected_payment_structure = payment_structure
      AND (payment_options_json IS NULL OR
        payment_options_json @> jsonb_build_array(jsonb_build_object('structure', selected_payment_structure)))
    )
  );
-- Existing approvals already selected their sole schedule. RLS stays staff-only;
-- prospects still respond solely through their proposal's existing secret token.
UPDATE public.proposals SET selected_payment_structure = payment_structure
WHERE approved_at IS NOT NULL;
