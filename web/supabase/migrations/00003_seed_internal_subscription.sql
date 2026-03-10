-- =============================================================================
-- Seed: assign internal (unlimited) plan to the owner firm
-- =============================================================================
-- This function can be called to grant a firm the internal unlimited plan.
-- Usage: SELECT assign_internal_plan('<firm_id>');
-- =============================================================================

CREATE OR REPLACE FUNCTION assign_internal_plan(target_firm_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    internal_plan_id uuid;
    sub_id uuid;
BEGIN
    -- Find the internal plan
    SELECT id INTO internal_plan_id
    FROM subscription_plans
    WHERE slug = 'internal'
    LIMIT 1;

    IF internal_plan_id IS NULL THEN
        RAISE EXCEPTION 'Internal plan not found. Run the billing schema migration first.';
    END IF;

    -- Cancel any existing active subscription for this firm
    UPDATE firm_subscriptions
    SET status = 'canceled', canceled_at = now()
    WHERE firm_id = target_firm_id
      AND status IN ('active', 'trialing', 'past_due');

    -- Create the internal subscription
    INSERT INTO firm_subscriptions (firm_id, plan_id, status, billing_interval, current_period_start)
    VALUES (target_firm_id, internal_plan_id, 'active', 'annual', now())
    RETURNING id INTO sub_id;

    -- Update the firm record
    UPDATE firms
    SET subscription_plan = 'internal',
        subscription_status = 'active',
        plan_type = 'internal'
    WHERE id = target_firm_id;

    RETURN sub_id;
END;
$$;
