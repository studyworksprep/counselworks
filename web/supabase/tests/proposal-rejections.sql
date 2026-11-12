\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'Assertion failed: %',msg; END IF; END $$;
CREATE TEMP TABLE rejection_test AS SELECT gen_random_uuid() id,
 (SELECT jsonb_build_object('sub',auth_provider_user_id,'role','authenticated')::text FROM users WHERE id='a0000000-0000-4000-8000-000000000012') alpha_staff,
 (SELECT jsonb_build_object('sub',auth_provider_user_id,'role','authenticated')::text FROM users WHERE id='a0000000-0000-4000-8000-000000000013') alpha_parent,
 (SELECT jsonb_build_object('sub',auth_provider_user_id,'role','authenticated')::text FROM users WHERE id='b0000000-0000-4000-8000-000000000012') beta_staff,
 (SELECT jsonb_build_object('sub',auth_provider_user_id,'role','authenticated')::text FROM users WHERE id='a0000000-0000-4000-8000-000000000015') alpha_student;
GRANT SELECT ON rejection_test TO authenticated;
INSERT INTO proposals(id,firm_id,status,parent_first_name,parent_last_name,parent_email,
 student_first_name,student_last_name,graduation_year,title,services_summary,total_cost_cents,
 discounted_cost_cents,payment_structure,payment_schedule_json,valid_until,public_token,sent_at,created_by_user_id)
SELECT id,'a0000000-0000-4000-8000-000000000001','sent','Test','Parent','test@example.com',
 'Test','Student',2028,'Rejection regression','Counseling',10000,10000,'custom',
 '[{"installment_number":1,"label":"Full fee","amount_cents":10000,"is_retainer":false,"due_on":"2027-01-01"}]',
 '2027-01-01',substr(md5(random()::text)||md5(random()::text),1,48),now(),'a0000000-0000-4000-8000-000000000012'
FROM rejection_test;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',(SELECT alpha_parent FROM rejection_test),true);
SELECT pg_temp.assert((SELECT count(*)=0 FROM proposals WHERE id=(SELECT id FROM rejection_test)), 'portal cannot read prospect pricing or feedback');
SELECT set_config('request.jwt.claims',(SELECT alpha_student FROM rejection_test),true);
SELECT pg_temp.assert((SELECT count(*)=0 FROM proposals WHERE id=(SELECT id FROM rejection_test)), 'student cannot read prospect pricing or feedback');
SELECT set_config('request.jwt.claims',(SELECT beta_staff FROM rejection_test),true);
SELECT pg_temp.assert((SELECT count(*)=0 FROM proposals WHERE id=(SELECT id FROM rejection_test)), 'other firm cannot read proposal');
SELECT set_config('request.jwt.claims',(SELECT alpha_staff FROM rejection_test),true);
SELECT pg_temp.assert((SELECT count(*)=1 FROM proposals WHERE id=(SELECT id FROM rejection_test)), 'own-firm staff can reach the proposal');
DO $$ DECLARE denied boolean:=false; BEGIN
 BEGIN UPDATE proposals SET status='rejected',rejected_at=now(),rejection_comment='  ' WHERE id=(SELECT id FROM rejection_test);
 EXCEPTION WHEN check_violation THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,'blank feedback refused');
 denied:=false;
 BEGIN UPDATE proposals SET status='rejected',rejected_at=now(),rejection_comment=repeat('x',5001) WHERE id=(SELECT id FROM rejection_test);
 EXCEPTION WHEN check_violation THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,'oversized feedback refused');
END $$;
UPDATE proposals SET status='rejected',rejected_at=now(),rejection_comment=E'Please adjust the payment schedule.\nThank you.'
WHERE id=(SELECT id FROM rejection_test) AND status='sent';
SELECT pg_temp.assert((SELECT status='rejected' AND rejected_at IS NOT NULL AND public_token IS NOT NULL AND rejection_comment LIKE 'Please adjust%' FROM proposals WHERE id=(SELECT id FROM rejection_test)), 'rejection and feedback persist with readable confirmation link');
DO $$ DECLARE n int; BEGIN
 UPDATE proposals SET status='approved',approved_at=now(),approved_by_name='Parent',approved_via='link'
 WHERE id=(SELECT id FROM rejection_test) AND status='sent';
 GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM pg_temp.assert(n=0,'a later approval cannot replace rejection');
END $$;
UPDATE proposals SET status='withdrawn',withdrawn_at=now(),public_token=NULL WHERE id=(SELECT id FROM rejection_test);
SELECT pg_temp.assert((SELECT status='withdrawn' AND public_token IS NULL AND rejection_comment IS NOT NULL FROM proposals WHERE id=(SELECT id FROM rejection_test)), 'withdraw revokes link and preserves feedback');
RESET ROLE;
ROLLBACK;
\echo 'Proposal rejection persistence, constraints, and tenant isolation passed.'
