\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.must_fail(statement text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN insufficient_privilege OR check_violation OR raise_exception OR foreign_key_violation OR unique_violation THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Expected rejection: %',statement; END IF;
END $$;
CREATE FUNCTION pg_temp.ref(kind text,id uuid,revision integer) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_array(jsonb_build_object('kind',kind,'id',id,'revision',revision)) $$;
INSERT INTO student_interview_answers(id,firm_id,student_id,respondent_user_id,respondent_kind,question_key,answer,state,audience) VALUES
 ('c5800000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015','student','P1','Student priorities','answered','counselor'),
 ('c5800000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000013','parent','R1','Private parent context','answered','counselor');
INSERT INTO student_story_bank(id,firm_id,student_id,kind,title,body,audience,review_state,created_by_user_id) VALUES
 ('c5800000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','story','A shared story','Student experience','family','confirmed','a0000000-0000-4000-8000-000000000015');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO student_strategy_sections(id,firm_id,student_id,section_key,body,evidence,publication_state,created_by_user_id,updated_by_user_id) VALUES
 ('c5800000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','priorities','Student direction',pg_temp.ref('answer','c5800000-0000-4000-8000-000000000001',1),'draft','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012'),
 ('c5800000-0000-4000-8000-000000000011','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','strengths','Evidence based synthesis',pg_temp.ref('bank','c5800000-0000-4000-8000-000000000003',1),'draft','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012'),
 ('c5800000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','alignment','Private parent synthesis',pg_temp.ref('answer','c5800000-0000-4000-8000-000000000002',1),'draft','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012'),
 ('c5800000-0000-4000-8000-000000000013','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','counselor_notes','Never shared working notes','[]','draft','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012');
SELECT pg_temp.must_fail($q$UPDATE student_strategy_sections SET publication_state='shared',revision=2 WHERE id='c5800000-0000-4000-8000-000000000012'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_strategy_sections SET publication_state='shared',revision=2 WHERE id='c5800000-0000-4000-8000-000000000013'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_strategy_sections SET student_id='b0000000-0000-4000-8000-000000000041',revision=2 WHERE id='c5800000-0000-4000-8000-000000000010'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_strategy_sections SET evidence='[{"kind":"answer","id":"c5800000-0000-4000-8000-000000000002","revision":999}]',revision=2 WHERE id='c5800000-0000-4000-8000-000000000010'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_strategy_sections SET evidence='[{"kind":"answer","id":"not-a-uuid","revision":1}]',revision=2 WHERE id='c5800000-0000-4000-8000-000000000010'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_strategy_sections SET evidence='[{"kind":"bank","id":"c5800000-0000-4000-8000-000000000003","revision":null}]',revision=2 WHERE id='c5800000-0000-4000-8000-000000000010'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_strategy_sections SET evidence='[{"kind":null,"id":"c5800000-0000-4000-8000-000000000003","revision":1}]',revision=2 WHERE id='c5800000-0000-4000-8000-000000000010'$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_strategy_sections) THEN RAISE EXCEPTION 'Student read counselor drafts'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
UPDATE student_strategy_sections SET publication_state='shared',revision=2 WHERE id IN ('c5800000-0000-4000-8000-000000000010','c5800000-0000-4000-8000-000000000011');
SELECT pg_temp.must_fail($q$UPDATE student_strategy_sections SET family_shared=true,student_review='accurate',revision=3 WHERE id='c5800000-0000-4000-8000-000000000011'$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_strategy_sections) THEN RAISE EXCEPTION 'Parent read before student approval'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DO $$ BEGIN IF (SELECT count(*) FROM student_strategy_sections)<>2 THEN RAISE EXCEPTION 'Student shared brief unavailable'; END IF; END $$;
SELECT pg_temp.must_fail($q$UPDATE student_strategy_sections SET body='Student rewrites counselor',updated_by_user_id='a0000000-0000-4000-8000-000000000015',revision=3 WHERE id='c5800000-0000-4000-8000-000000000010'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_strategy_sections SET family_shared=true,student_review='accurate',updated_by_user_id='a0000000-0000-4000-8000-000000000015',revision=3 WHERE id='c5800000-0000-4000-8000-000000000010'$q$);
UPDATE student_strategy_sections SET student_review='accurate',student_note='Student approves this perspective',family_shared=true,updated_by_user_id='a0000000-0000-4000-8000-000000000015',revision=3 WHERE id='c5800000-0000-4000-8000-000000000011';
SELECT pg_temp.must_fail($q$UPDATE student_strategy_sections SET student_note='Stale write',updated_by_user_id='a0000000-0000-4000-8000-000000000015',revision=3 WHERE id='c5800000-0000-4000-8000-000000000011'$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM student_strategy_sections)<>1 OR NOT EXISTS(SELECT 1 FROM student_strategy_sections WHERE student_note='Student approves this perspective') THEN RAISE EXCEPTION 'Approved section missing'; END IF;
END $$;
UPDATE student_strategy_sections SET body='Parent rewrite',revision=4 WHERE id='c5800000-0000-4000-8000-000000000011';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent2"}',true);
DO $$ BEGIN IF (SELECT count(*) FROM student_strategy_sections)<>1 OR EXISTS(SELECT 1 FROM student_strategy_sections WHERE body='Parent rewrite') THEN RAISE EXCEPTION 'Parent write or shared-read failure'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
UPDATE student_story_bank SET body='Changed source',revision=2 WHERE id='c5800000-0000-4000-8000-000000000003';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_strategy_sections) THEN RAISE EXCEPTION 'Parent read section with changed source'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DO $$ BEGIN IF (SELECT count(*) FROM student_strategy_sections)<>2 THEN RAISE EXCEPTION 'Student lost ability to review stale synthesis'; END IF; END $$;
UPDATE student_strategy_sections SET student_review='discuss',student_note='Please revisit after my new story',family_shared=false,updated_by_user_id='a0000000-0000-4000-8000-000000000015',revision=4 WHERE id='c5800000-0000-4000-8000-000000000011';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SELECT pg_temp.must_fail($q$UPDATE student_strategy_sections SET body='Keeps stale approval',revision=5 WHERE id='c5800000-0000-4000-8000-000000000011'$q$);
UPDATE student_strategy_sections SET body='Updated counselor synthesis',evidence=pg_temp.ref('bank','c5800000-0000-4000-8000-000000000003',2),student_review='pending',family_shared=false,updated_by_user_id='a0000000-0000-4000-8000-000000000012',revision=5 WHERE id='c5800000-0000-4000-8000-000000000011';
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM student_strategy_sections WHERE student_note='Please revisit after my new story') THEN RAISE EXCEPTION 'Counselor erased student feedback'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
UPDATE student_strategy_sections SET student_review='accurate',family_shared=true,updated_by_user_id='a0000000-0000-4000-8000-000000000015',revision=6 WHERE id='c5800000-0000-4000-8000-000000000011';
-- Withdrawal works without modifying counselor words or source sharing.
UPDATE student_strategy_sections SET family_shared=false,updated_by_user_id='a0000000-0000-4000-8000-000000000015',revision=7 WHERE id='c5800000-0000-4000-8000-000000000011';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent2"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_strategy_sections) THEN RAISE EXCEPTION 'Withdrawn brief still visible'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
UPDATE student_interview_answers SET audience='family',revision=2 WHERE id='c5800000-0000-4000-8000-000000000002';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
UPDATE student_strategy_sections SET evidence=pg_temp.ref('answer','c5800000-0000-4000-8000-000000000002',2),publication_state='shared',revision=2 WHERE id='c5800000-0000-4000-8000-000000000012';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM student_strategy_sections WHERE section_key='alignment') THEN RAISE EXCEPTION 'Family-shared parent source unavailable'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
UPDATE student_interview_answers SET audience='counselor',revision=3 WHERE id='c5800000-0000-4000-8000-000000000002';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_strategy_sections WHERE section_key='alignment') THEN RAISE EXCEPTION 'Parent withdrawal did not protect synthesis'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_beta_owner"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_strategy_sections) THEN RAISE EXCEPTION 'Cross-firm strategy leak'; END IF; END $$;
RESET ROLE;
INSERT INTO users(id,auth_provider_user_id,email,first_name,last_name) VALUES
 ('c5800000-0000-4000-8000-000000000050','test_strategy_unassigned','strategy-unassigned@example.test','Unassigned','Staff');
INSERT INTO firm_memberships(firm_id,user_id,role) VALUES ('a0000000-0000-4000-8000-000000000001','c5800000-0000-4000-8000-000000000050','counselor');
SELECT set_config('request.jwt.claims','{"sub":"test_strategy_unassigned"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_strategy_sections) THEN RAISE EXCEPTION 'Unassigned counselor read strategy'; END IF; END $$;
RESET ROLE;
UPDATE firm_memberships SET role='read_only_staff' WHERE user_id='a0000000-0000-4000-8000-000000000011';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_owner"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM student_strategy_sections)<>4 THEN RAISE EXCEPTION 'Read-only staff lost reading access'; END IF; END $$;
UPDATE student_strategy_sections SET body='Read-only rewrite',revision=8 WHERE id='c5800000-0000-4000-8000-000000000011';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_strategy_sections WHERE body='Read-only rewrite') THEN RAISE EXCEPTION 'Read-only staff wrote strategy'; END IF; END $$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT * FROM student_strategy_sections');
SELECT pg_temp.must_fail($q$SELECT public.strategy_sources_ready('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','[]','staff',true)$q$);
RESET ROLE;
ROLLBACK;
\echo 'Strategy publication, source visibility, reviews, consent and isolation checks passed'
