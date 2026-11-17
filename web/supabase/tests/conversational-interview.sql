\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.must_fail(statement text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN insufficient_privilege OR check_violation OR raise_exception OR foreign_key_violation OR unique_violation THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Expected rejection: %',statement; END IF;
END $$;
-- Existing rows retain their exact text, privacy and historical context boundary.
INSERT INTO student_interview_answers(id,firm_id,student_id,respondent_user_id,respondent_kind,question_key,answer,state,audience) VALUES
 ('c6500000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015','student','H1','Private legacy memory','discuss','counselor');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
INSERT INTO student_interview_answers(id,firm_id,student_id,respondent_user_id,respondent_kind,question_key,template_version,structured_response,state,audience,discussion_requested) VALUES
 ('c6500000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015','student','FIT_SIZE',2,'{"version":2,"optionIds":["small"],"text":"I could also visit a medium campus","importance":"important"}','answered',NULL,true);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM student_interview_answers WHERE id='c6500000-0000-4000-8000-000000000002' AND audience='family' AND discussion_requested AND answer LIKE 'Under 5,000%') THEN RAISE EXCEPTION 'New student default, readable rendering or discussion semantics failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM student_interview_answers WHERE id='c6500000-0000-4000-8000-000000000001' AND template_version=1 AND audience='counselor' AND state='discuss' AND answer='Private legacy memory') THEN RAISE EXCEPTION 'Legacy answer changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.student_ai_context('a0000000-0000-4000-8000-000000000001',public.current_user_id(),'a0000000-0000-4000-8000-000000000041',public.current_user_id())->'sources') s WHERE s->>'id'='c6500000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'Discussion flag suppressed an answer from context'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.student_ai_context('a0000000-0000-4000-8000-000000000001',public.current_user_id(),'a0000000-0000-4000-8000-000000000041',public.current_user_id())->'sources') s WHERE s->>'id'='c6500000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Legacy discuss leaked into context'; END IF;
END $$;
SELECT pg_temp.must_fail($q$UPDATE student_interview_answers SET structured_response='{"version":2,"optionIds":["city"],"text":"","importance":"preference"}',revision=2 WHERE id='c6500000-0000-4000-8000-000000000002'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_interview_answers SET structured_response='{"version":2,"optionIds":["small","flexible"],"text":"","importance":"preference"}',revision=2 WHERE id='c6500000-0000-4000-8000-000000000002'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_interview_answers SET structured_response='{"version":2,"optionIds":["small","small"],"text":"","importance":"preference"}',revision=2 WHERE id='c6500000-0000-4000-8000-000000000002'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_interview_answers SET structured_response='{"version":2,"optionIds":["small"],"text":"","importance":null}',revision=2 WHERE id='c6500000-0000-4000-8000-000000000002'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_interview_answers SET state='discuss',revision=2 WHERE id='c6500000-0000-4000-8000-000000000002'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_interview_answers SET revision=1 WHERE id='c6500000-0000-4000-8000-000000000002'$q$);
SELECT pg_temp.must_fail($q$UPDATE interview_question_definitions SET definition='{}' WHERE question_key='FIT_SIZE'$q$);
-- Both parents see only shared answers, and never the original private legacy row.
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM student_interview_answers WHERE id::text LIKE 'c650%')<>1 THEN RAISE EXCEPTION 'Parent audience failed'; END IF;
END $$;
INSERT INTO student_interview_answers(id,firm_id,student_id,respondent_user_id,respondent_kind,question_key,template_version,structured_response,state,audience) VALUES
 ('c6500000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000013','parent','R2',2,'{"version":2,"optionIds":[],"text":"Private parent constraints","importance":"preference"}','answered',NULL);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM student_interview_answers WHERE id='c6500000-0000-4000-8000-000000000003' AND audience='counselor') THEN RAISE EXCEPTION 'Parent default widened'; END IF;END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent2"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_interview_answers WHERE id='c6500000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Other parent private answer leaked'; END IF;END $$;
UPDATE student_interview_answers SET audience='family',revision=2 WHERE id='c6500000-0000-4000-8000-000000000003';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
UPDATE student_interview_answers SET audience='counselor',revision=2 WHERE id='c6500000-0000-4000-8000-000000000002';
-- Deterministic branch sources stop being context when the parent choice changes.
INSERT INTO student_interview_answers(id,firm_id,student_id,respondent_user_id,respondent_kind,question_key,template_version,structured_response,state,audience) VALUES
 ('c6500000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015','student','A3',2,'{"version":2,"optionIds":["focused"],"text":"","importance":"preference"}','answered','counselor'),
 ('c6500000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015','student','FIT_PROGRAM_DETAIL',2,'{"version":2,"optionIds":[],"text":"Ecology","importance":"important"}','answered','counselor');
DO $$ BEGIN IF NOT public.interview_answer_active('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041',public.current_user_id(),'FIT_PROGRAM_DETAIL',2) THEN RAISE EXCEPTION 'Branch did not activate'; END IF;END $$;
UPDATE student_interview_answers SET structured_response='{"version":2,"optionIds":["exploring"],"text":"","importance":"preference"}',revision=2 WHERE id='c6500000-0000-4000-8000-000000000004';
DO $$ BEGIN
 IF public.interview_answer_active('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041',public.current_user_id(),'FIT_PROGRAM_DETAIL',2) THEN RAISE EXCEPTION 'Inactive branch stayed active'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.student_ai_context('a0000000-0000-4000-8000-000000000001',public.current_user_id(),'a0000000-0000-4000-8000-000000000041',public.current_user_id())->'sources') s WHERE s->>'id'='c6500000-0000-4000-8000-000000000005') THEN RAISE EXCEPTION 'Inactive branch context leaked'; END IF;
END $$;
UPDATE student_interview_answers SET state='deferred',revision=3 WHERE id='c6500000-0000-4000-8000-000000000004';
DO $$ BEGIN IF NOT (public.student_ai_context('a0000000-0000-4000-8000-000000000001',public.current_user_id(),'a0000000-0000-4000-8000-000000000041',public.current_user_id())->'excludedQuestionKeys' ? 'A3') THEN RAISE EXCEPTION 'Deferred question not excluded'; END IF;END $$;
UPDATE student_interview_answers SET state='declined',revision=4 WHERE id='c6500000-0000-4000-8000-000000000004';
-- Assigned counselor follows a request once. Closing does not erase the preference.
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
INSERT INTO student_interview_followups(id,firm_id,student_id,recipient_user_id,created_by_user_id,source_answer_id,question,audience,discussion_request) VALUES
 ('c6500000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015','a0000000-0000-4000-8000-000000000012','c6500000-0000-4000-8000-000000000002','What would you like to check together?','counselor',true);
SELECT pg_temp.must_fail($q$INSERT INTO student_interview_followups(firm_id,student_id,recipient_user_id,created_by_user_id,source_answer_id,question,audience,discussion_request) VALUES ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015','a0000000-0000-4000-8000-000000000012','c6500000-0000-4000-8000-000000000002','Duplicate','counselor',true)$q$);
UPDATE student_interview_followups SET status='closed',revision=2 WHERE id='c6500000-0000-4000-8000-000000000006';
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM student_interview_answers WHERE id='c6500000-0000-4000-8000-000000000002' AND state='answered' AND audience='counselor' AND discussion_requested) THEN RAISE EXCEPTION 'Discussion changed answer';END IF;END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_interview_answers WHERE id='c6500000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'Withdrawal failed'; END IF;END $$;
-- Assignment removal and cross-firm actors lose v2 rows just as they lose v1.
RESET ROLE;
DELETE FROM student_staff_assignments WHERE firm_id='a0000000-0000-4000-8000-000000000001' AND student_id='a0000000-0000-4000-8000-000000000041' AND user_id='a0000000-0000-4000-8000-000000000012';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_interview_answers WHERE id::text LIKE 'c650%') THEN RAISE EXCEPTION 'Unassigned counselor saw v2'; END IF;END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_beta_owner"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_interview_answers WHERE id::text LIKE 'c650%') THEN RAISE EXCEPTION 'Cross-firm v2 leak'; END IF;END $$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail($q$SELECT * FROM student_interview_answers$q$);
ROLLBACK;
