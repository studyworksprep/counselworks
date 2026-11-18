\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(ok, false) THEN RAISE EXCEPTION 'Assertion failed: %', msg; END IF; END $$;
CREATE TEMP TABLE agreement_default_test AS SELECT gen_random_uuid() alpha_template, gen_random_uuid() beta_template,
  (SELECT jsonb_build_object('sub', auth_provider_user_id, 'role', 'authenticated')::text FROM users WHERE id = 'a0000000-0000-4000-8000-000000000011') alpha_owner,
  (SELECT jsonb_build_object('sub', auth_provider_user_id, 'role', 'authenticated')::text FROM users WHERE id = 'a0000000-0000-4000-8000-000000000013') alpha_parent;
GRANT SELECT ON agreement_default_test TO authenticated;
INSERT INTO agreement_templates (id, firm_id, name, body, created_by_user_id, updated_by_user_id)
SELECT alpha_template, 'a0000000-0000-4000-8000-000000000001'::uuid, 'Standard Alpha', 'Alpha terms', 'a0000000-0000-4000-8000-000000000011'::uuid, 'a0000000-0000-4000-8000-000000000011'::uuid FROM agreement_default_test
UNION ALL
SELECT beta_template, 'b0000000-0000-4000-8000-000000000001'::uuid, 'Standard Beta', 'Beta terms', 'b0000000-0000-4000-8000-000000000011'::uuid, 'b0000000-0000-4000-8000-000000000011'::uuid FROM agreement_default_test;
UPDATE firm_settings SET proposal_agreement_template_id = (SELECT alpha_template FROM agreement_default_test)
WHERE firm_id = 'a0000000-0000-4000-8000-000000000001';
DO $$ DECLARE denied boolean := false; BEGIN
  BEGIN
    UPDATE firm_settings SET proposal_agreement_template_id = (SELECT beta_template FROM agreement_default_test)
    WHERE firm_id = 'a0000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN foreign_key_violation THEN denied := true; END;
  PERFORM pg_temp.assert(denied, 'a default cannot reference another firm template');
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', (SELECT alpha_owner FROM agreement_default_test), true);
SELECT pg_temp.assert((SELECT proposal_agreement_template_id = (SELECT alpha_template FROM agreement_default_test) FROM firm_settings WHERE firm_id = 'a0000000-0000-4000-8000-000000000001'), 'owner can read their configured standard');
SELECT pg_temp.assert(NOT EXISTS (SELECT FROM firm_settings WHERE firm_id = 'b0000000-0000-4000-8000-000000000001'), 'other firm configuration is invisible');
SELECT set_config('request.jwt.claims', (SELECT alpha_parent FROM agreement_default_test), true);
DO $$ DECLARE changed integer; BEGIN
  UPDATE firm_settings SET proposal_agreement_template_id = NULL WHERE firm_id = 'a0000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS changed = ROW_COUNT;
  PERFORM pg_temp.assert(changed = 0, 'parents cannot change standard agreements');
END $$;
RESET ROLE;
DELETE FROM agreement_templates WHERE id = (SELECT alpha_template FROM agreement_default_test);
SELECT pg_temp.assert((SELECT proposal_agreement_template_id IS NULL AND firm_id = 'a0000000-0000-4000-8000-000000000001' FROM firm_settings WHERE firm_id = 'a0000000-0000-4000-8000-000000000001'), 'deleting the template clears only its optional reference');
ROLLBACK;
\echo 'Proposal agreement default constraints and isolation passed.'
