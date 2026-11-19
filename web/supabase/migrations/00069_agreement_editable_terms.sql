-- Existing contracts retain their signed dates; new proposal agreements opt in
-- only when the same payment-timing rule is part of their signed body snapshot.
ALTER TABLE public.service_agreements
    ADD COLUMN invoice_not_before_execution boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.service_agreements.invoice_not_before_execution IS
    'For contracts containing the execution-date payment clause, invoice due dates cannot precede the firm-local date both signatures are complete. Fixed at issuance.';

CREATE FUNCTION public.keep_agreement_invoice_date_policy()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    RAISE EXCEPTION 'Invoice date policy is fixed when an agreement is sent'
        USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER agreement_invoice_date_policy_immutable
    BEFORE UPDATE OF invoice_not_before_execution ON public.service_agreements
    FOR EACH ROW
    WHEN (OLD.invoice_not_before_execution IS DISTINCT FROM NEW.invoice_not_before_execution)
    EXECUTE FUNCTION public.keep_agreement_invoice_date_policy();
