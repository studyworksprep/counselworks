\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'Assertion failed: %',msg; END IF; END $$;
CREATE TEMP TABLE payment_choice_test AS SELECT gen_random_uuid() id,
 (SELECT jsonb_build_object('sub',auth_provider_user_id,'role','authenticated')::text FROM users WHERE id='a0000000-0000-4000-8000-000000000012') alpha_staff,
 (SELECT jsonb_build_object('sub',auth_provider_user_id,'role','authenticated')::text FROM users WHERE id='a0000000-0000-4000-8000-000000000013') alpha_parent,
 (SELECT jsonb_build_object('sub',auth_provider_user_id,'role','authenticated')::text FROM users WHERE id='b0000000-0000-4000-8000-000000000012') beta_staff,
 (SELECT jsonb_build_object('sub',auth_provider_user_id,'role','authenticated')::text FROM users WHERE id='a0000000-0000-4000-8000-000000000015') alpha_student;
GRANT SELECT ON payment_choice_test TO authenticated;
INSERT INTO proposals(id,firm_id,status,parent_first_name,parent_last_name,parent_email,
 student_first_name,student_last_name,graduation_year,title,services_summary,total_cost_cents,
 discounted_cost_cents,payment_structure,payment_schedule_json,valid_until,public_token,sent_at,created_by_user_id)
SELECT id,'a0000000-0000-4000-8000-000000000001','sent','Test','Parent','test@example.com',
 'Test','Student',2028,'Payment choice regression','Counseling',10000,10000,'custom',
 '[{"installment_number":1,"label":"Full fee","amount_cents":10000,"is_retainer":false,"due_on":"2027-01-01"}]',
 '2027-01-01',substr(md5(random()::text)||md5(random()::text),1,48),now(),'a0000000-0000-4000-8000-000000000012'
FROM payment_choice_test;

-- Offer half/half and a full custom payment. No preference is implied.
UPDATE proposals SET payment_options_json = jsonb_build_array(
  jsonb_build_object('structure','half_half','deposit_cents',NULL,'installment_count',NULL,'first_due_on','2027-01-01',
    'payment_schedule_json','[{"installment_number":1,"label":"First half","amount_cents":5000,"is_retainer":true,"due_on":null},{"installment_number":2,"label":"Second half","amount_cents":5000,"is_retainer":false,"due_on":"2027-01-01"}]'::jsonb),
  jsonb_build_object('structure','custom','deposit_cents',NULL,'installment_count',NULL,'first_due_on',NULL,'payment_schedule_json',payment_schedule_json)
) WHERE id=(SELECT id FROM payment_choice_test);
DO $$ DECLARE denied boolean:=false; BEGIN
 BEGIN UPDATE proposals SET status='approved',approved_at=now(),approved_by_name='Parent',approved_via='link'
 WHERE id=(SELECT id FROM payment_choice_test);
 EXCEPTION WHEN check_violation THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,'multi-option approval requires a saved preference');
 denied:=false;
 BEGIN UPDATE proposals SET selected_payment_structure='deposit_monthly' WHERE id=(SELECT id FROM payment_choice_test);
 EXCEPTION WHEN check_violation THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,'selection must be an offered option and match the effective schedule');
 denied:=false;
 BEGIN UPDATE proposals SET payment_options_json='[]' WHERE id=(SELECT id FROM payment_choice_test);
 EXCEPTION WHEN check_violation THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,'empty offers refused');
END $$;
UPDATE proposals SET status='approved',approved_at=now(),approved_by_name='Parent',approved_via='link',selected_payment_structure='custom'
WHERE id=(SELECT id FROM payment_choice_test) AND status='sent';
SELECT pg_temp.assert((SELECT selected_payment_structure='custom' AND payment_structure='custom' AND jsonb_array_length(payment_options_json)=2
FROM proposals WHERE id=(SELECT id FROM payment_choice_test)), 'non-default selection persists alongside the complete offer');
DO $$ DECLARE n int; BEGIN
 UPDATE proposals SET selected_payment_structure='half_half' WHERE id=(SELECT id FROM payment_choice_test) AND status='sent';
 GET DIAGNOSTICS n=ROW_COUNT;
 PERFORM pg_temp.assert(n=0,'a later response cannot replace the approved preference');
END $$;
ROLLBACK;
\echo 'Proposal payment choice persistence and constraints passed.'
