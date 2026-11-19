\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'Assertion failed: %',msg; END IF; END $$;
CREATE TEMP TABLE agreement_date_test AS SELECT gen_random_uuid() legacy_id, gen_random_uuid() new_id,
  (SELECT jsonb_build_object('sub',auth_provider_user_id,'role','authenticated')::text FROM users WHERE id='a0000000-0000-4000-8000-000000000011') owner_claims,
  (SELECT jsonb_build_object('sub',auth_provider_user_id,'role','authenticated')::text FROM users WHERE id='a0000000-0000-4000-8000-000000000013') parent_claims;
GRANT SELECT ON agreement_date_test TO authenticated;
INSERT INTO service_agreements(id,firm_id,family_id,title,body_snapshot,document_hash,created_by_user_id)
SELECT legacy_id,'a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000021','Legacy test','Old signed dates','test','a0000000-0000-4000-8000-000000000011' FROM agreement_date_test;
INSERT INTO service_agreements(id,firm_id,family_id,title,body_snapshot,document_hash,created_by_user_id,invoice_not_before_execution)
SELECT new_id,'a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000021','New test','Execution-date payment policy','test','a0000000-0000-4000-8000-000000000011',true FROM agreement_date_test;
SELECT pg_temp.assert((SELECT NOT invoice_not_before_execution FROM service_agreements WHERE id=(SELECT legacy_id FROM agreement_date_test)),'older contracts keep scheduled dates by default');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',(SELECT owner_claims FROM agreement_date_test),true);
SELECT pg_temp.assert((SELECT invoice_not_before_execution FROM service_agreements WHERE id=(SELECT new_id FROM agreement_date_test)),'own firm can read the stored policy');
DO $$ DECLARE denied boolean:=false; BEGIN
  BEGIN UPDATE service_agreements SET invoice_not_before_execution=false WHERE id=(SELECT new_id FROM agreement_date_test);
  EXCEPTION WHEN check_violation THEN denied:=true; END;
  PERFORM pg_temp.assert(denied,'staff cannot rewrite the policy after sending');
END $$;
UPDATE service_agreements SET status='partially_signed' WHERE id=(SELECT new_id FROM agreement_date_test);
SELECT set_config('request.jwt.claims',(SELECT parent_claims FROM agreement_date_test),true);
DO $$ DECLARE denied boolean:=false; BEGIN
  BEGIN UPDATE service_agreements SET invoice_not_before_execution=false WHERE id=(SELECT new_id FROM agreement_date_test);
  EXCEPTION WHEN check_violation THEN denied:=true; END;
  PERFORM pg_temp.assert(denied,'a portal client cannot change signed invoice timing');
END $$;
RESET ROLE;
ROLLBACK;
\echo 'Agreement invoice date defaults and immutability passed.'
