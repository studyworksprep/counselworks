\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.must_fail(statement text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN insufficient_privilege OR check_violation OR raise_exception OR foreign_key_violation THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Expected operation to be rejected: %',statement; END IF;
END $$;
INSERT INTO essay_drafts(id,firm_id,student_id,essay_type,title,body,visibility_scope,created_by_user_id,updated_by_user_id) VALUES
 ('c5700000-0000-4000-8000-000000000090','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','personal_statement','Interview linked essay','Existing writing','family','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012'),
 ('c5700000-0000-4000-8000-000000000091','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000041','personal_statement','Other firm essay','Other writing','family','b0000000-0000-4000-8000-000000000012','b0000000-0000-4000-8000-000000000012');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO student_interview_answers(id,firm_id,student_id,respondent_user_id,respondent_kind,question_key,answer,state,audience) VALUES
 ('c5700000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015','student','H1','An ordinary object and a specific memory','answered','counselor');
INSERT INTO student_interview_checkpoints(firm_id,student_id,respondent_user_id,stage) VALUES
 ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015',1);
SELECT pg_temp.must_fail($q$UPDATE student_interview_answers SET answer='Stale change',revision=1 WHERE id='c5700000-0000-4000-8000-000000000001'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_interview_answers SET student_id='b0000000-0000-4000-8000-000000000041',revision=2 WHERE id='c5700000-0000-4000-8000-000000000001'$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_interview_answers WHERE id='c5700000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Parent read private student response'; END IF; END $$;
INSERT INTO student_interview_answers(id,firm_id,student_id,respondent_user_id,respondent_kind,question_key,answer,state,audience) VALUES
 ('c5700000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000013','parent','R1','A parent perspective, not student words','answered','counselor');
SELECT pg_temp.must_fail($q$INSERT INTO student_interview_answers(firm_id,student_id,respondent_user_id,respondent_kind,question_key,state,audience) VALUES ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015','student','A3','unsure','family')$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent2"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_interview_answers) THEN RAISE EXCEPTION 'Second parent read another respondent private answer'; END IF; END $$;
INSERT INTO student_interview_answers(id,firm_id,student_id,respondent_user_id,respondent_kind,question_key,answer,state,audience) VALUES
 ('c5700000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000014','parent','R1','An independent second parent answer','answered','family');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM student_interview_answers WHERE id='c5700000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'Student read private parent answer'; END IF;
 IF NOT EXISTS(SELECT 1 FROM student_interview_answers WHERE id='c5700000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Shared parent answer missing'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
DO $$ BEGIN IF (SELECT count(*) FROM student_interview_answers)<>3 THEN RAISE EXCEPTION 'Counselor cannot see separate responses'; END IF; END $$;
UPDATE student_interview_answers SET answer='Counselor rewrite',revision=2 WHERE id='c5700000-0000-4000-8000-000000000001';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_interview_answers WHERE answer='Counselor rewrite') THEN RAISE EXCEPTION 'Counselor rewrote student words'; END IF; END $$;
INSERT INTO student_story_bank(id,firm_id,student_id,kind,title,body,audience,review_state,created_by_user_id,source_answer_id) VALUES
 ('c5700000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','story','Object story','What happened in one scene','counselor','draft','a0000000-0000-4000-8000-000000000012','c5700000-0000-4000-8000-000000000001');
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM student_story_sources WHERE original_text='An ordinary object and a specific memory') THEN RAISE EXCEPTION 'Original source not captured'; END IF; END $$;
SELECT pg_temp.must_fail($q$UPDATE student_story_sources SET original_text='Rewritten source' WHERE entry_id='c5700000-0000-4000-8000-000000000010'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_story_bank SET audience='family',revision=2 WHERE id='c5700000-0000-4000-8000-000000000010'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_story_bank SET review_state='confirmed',revision=2 WHERE id='c5700000-0000-4000-8000-000000000010'$q$);
SELECT pg_temp.must_fail($q$INSERT INTO student_story_bank(firm_id,student_id,kind,title,body,audience,review_state,created_by_user_id,source_answer_id) VALUES ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','story','Parent words','Do not attribute to student','counselor','draft','a0000000-0000-4000-8000-000000000012','c5700000-0000-4000-8000-000000000002')$q$);
INSERT INTO student_interview_followups(id,firm_id,student_id,recipient_user_id,created_by_user_id,source_answer_id,question,audience) VALUES
 ('c5700000-0000-4000-8000-000000000020','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015','a0000000-0000-4000-8000-000000000012','c5700000-0000-4000-8000-000000000001','What happened next?','counselor'),
 ('c5700000-0000-4000-8000-000000000021','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000013','a0000000-0000-4000-8000-000000000012','c5700000-0000-4000-8000-000000000002','What would help your family?','counselor');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_interview_followups WHERE id='c5700000-0000-4000-8000-000000000021') THEN RAISE EXCEPTION 'Student read private parent follow-up'; END IF; END $$;
UPDATE student_interview_followups SET reply='A specific action I took',status='answered',audience='family',revision=2 WHERE id='c5700000-0000-4000-8000-000000000020';
UPDATE student_story_bank SET audience='family',review_state='confirmed',revision=2 WHERE id='c5700000-0000-4000-8000-000000000010';
INSERT INTO student_story_bank(id,firm_id,student_id,kind,title,body,audience,review_state,created_by_user_id,story_ids) VALUES
 ('c5700000-0000-4000-8000-000000000011','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','narrative','A possible thread','A meaning the student confirmed','family','confirmed','a0000000-0000-4000-8000-000000000015',ARRAY['c5700000-0000-4000-8000-000000000010'::uuid]);
INSERT INTO student_story_essay_links(firm_id,student_id,entry_id,essay_id,created_by_user_id) VALUES
 ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','c5700000-0000-4000-8000-000000000010','c5700000-0000-4000-8000-000000000090','a0000000-0000-4000-8000-000000000015');
SELECT pg_temp.must_fail($q$INSERT INTO student_story_essay_links(firm_id,student_id,entry_id,essay_id,created_by_user_id) VALUES ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','c5700000-0000-4000-8000-000000000010','c5700000-0000-4000-8000-000000000091','a0000000-0000-4000-8000-000000000015')$q$);
UPDATE student_interview_answers SET answer='Revised interview answer',revision=2 WHERE id='c5700000-0000-4000-8000-000000000001';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM student_story_sources WHERE original_text='An ordinary object and a specific memory') THEN RAISE EXCEPTION 'Source overwritten by interview edit'; END IF;
 IF NOT EXISTS(SELECT 1 FROM essay_drafts WHERE id='c5700000-0000-4000-8000-000000000090' AND body='Existing writing' AND visibility_scope='family') THEN RAISE EXCEPTION 'Link rewrote essay'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM student_story_sources) THEN RAISE EXCEPTION 'Private original response leaked through a shared story'; END IF;
 IF (SELECT count(*) FROM student_story_bank)<>2 THEN RAISE EXCEPTION 'Shared story and narrative unavailable'; END IF;
 IF (SELECT count(*) FROM student_story_essay_links)<>1 THEN RAISE EXCEPTION 'Shared essay link unavailable'; END IF;
 IF (SELECT count(*) FROM student_interview_followups)<>2 THEN RAISE EXCEPTION 'Shared follow-up unavailable'; END IF;
END $$;
SELECT pg_temp.must_fail($q$UPDATE student_interview_followups SET question='Changed by parent',reply='Answer',status='answered',revision=2 WHERE id='c5700000-0000-4000-8000-000000000021'$q$);
UPDATE student_story_bank SET body='Parent rewrite',revision=3 WHERE id='c5700000-0000-4000-8000-000000000010';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_story_bank WHERE body='Parent rewrite') THEN RAISE EXCEPTION 'Parent rewrote student story'; END IF; END $$;
UPDATE student_story_bank SET body='An updated scene',review_state='confirmed',revision=3 WHERE id='c5700000-0000-4000-8000-000000000010';
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM student_story_bank WHERE id='c5700000-0000-4000-8000-000000000011' AND review_state='revisit') THEN RAISE EXCEPTION 'Changed evidence did not reopen narrative review'; END IF; END $$;
UPDATE student_story_bank SET audience='counselor',revision=4 WHERE id='c5700000-0000-4000-8000-000000000010';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM student_story_bank) THEN RAISE EXCEPTION 'Revoked story leaked through narrative'; END IF;
 IF EXISTS(SELECT 1 FROM student_story_essay_links) THEN RAISE EXCEPTION 'Revoked story leaked through essay link'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SELECT pg_temp.must_fail($q$UPDATE student_interview_followups SET reply='Counselor rewrite',status='closed',revision=3 WHERE id='c5700000-0000-4000-8000-000000000020'$q$);
UPDATE student_interview_followups SET status='closed',revision=3 WHERE id='c5700000-0000-4000-8000-000000000020';
SELECT pg_temp.must_fail($q$UPDATE student_story_bank SET body='A staff rewrite kept confirmed',review_state='confirmed',revision=5 WHERE id='c5700000-0000-4000-8000-000000000010'$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
UPDATE student_story_bank SET audience='family',revision=5 WHERE id='c5700000-0000-4000-8000-000000000010';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
UPDATE student_story_bank SET body='A staff proposal still needing student consent',review_state='draft',revision=6 WHERE id='c5700000-0000-4000-8000-000000000010';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_story_bank) THEN RAISE EXCEPTION 'Unconfirmed staff revision leaked to family'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_beta_owner"}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM student_interview_answers) OR EXISTS(SELECT 1 FROM student_story_sources) OR EXISTS(SELECT 1 FROM student_story_bank) OR EXISTS(SELECT 1 FROM student_interview_followups) OR EXISTS(SELECT 1 FROM student_interview_checkpoints) OR EXISTS(SELECT 1 FROM student_story_essay_links) THEN RAISE EXCEPTION 'Cross-firm interview data leaked'; END IF;
END $$;
RESET ROLE;
INSERT INTO users(id,auth_provider_user_id,email,first_name,last_name) VALUES
 ('c5700000-0000-4000-8000-000000000050','test_interview_unassigned','unassigned-interview@example.test','Unassigned','Counselor');
INSERT INTO firm_memberships(firm_id,user_id,role,status) VALUES
 ('a0000000-0000-4000-8000-000000000001','c5700000-0000-4000-8000-000000000050','counselor','active');
SELECT set_config('request.jwt.claims','{"sub":"test_interview_unassigned"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM student_interview_answers) OR EXISTS(SELECT 1 FROM student_story_sources) OR EXISTS(SELECT 1 FROM student_story_bank) OR EXISTS(SELECT 1 FROM student_interview_followups) THEN RAISE EXCEPTION 'Unassigned counselor read interview data'; END IF;
END $$;
RESET ROLE;
UPDATE firm_memberships SET role='read_only_staff' WHERE user_id='a0000000-0000-4000-8000-000000000011';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_owner"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM student_interview_answers)<>3 THEN RAISE EXCEPTION 'Read-only staff lost reading access'; END IF; END $$;
UPDATE student_story_bank SET body='Read-only staff rewrite',revision=5 WHERE id='c5700000-0000-4000-8000-000000000010';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_story_bank WHERE body='Read-only staff rewrite') THEN RAISE EXCEPTION 'Read-only staff edited a story'; END IF; END $$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT * FROM student_interview_answers');
SELECT pg_temp.must_fail('SELECT * FROM student_story_bank');
RESET ROLE;
ROLLBACK;
\echo 'Interview ownership, snapshots, evidence, reuse and sharing checks passed'
