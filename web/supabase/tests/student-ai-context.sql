\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.must_fail(statement text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE blocked boolean:=false;BEGIN BEGIN EXECUTE statement;EXCEPTION WHEN insufficient_privilege OR check_violation OR raise_exception OR unique_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Expected rejection: %',statement;END IF;END $$;
CREATE FUNCTION pg_temp.context(recipient uuid DEFAULT 'a0000000-0000-4000-8000-000000000015') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.student_ai_context('a0000000-0000-4000-8000-000000000001',public.current_user_id(),'a0000000-0000-4000-8000-000000000041',recipient) $$;
CREATE FUNCTION pg_temp.refs(source_id uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_agg(jsonb_build_object('kind',s->'kind','id',s->'id','revision',s->'revision','stamp',s->'stamp')) FROM jsonb_array_elements(pg_temp.context()->'sources') s WHERE s->>'id'=source_id::text $$;
INSERT INTO student_interview_answers(id,firm_id,student_id,respondent_user_id,respondent_kind,question_key,answer,state,audience) VALUES
 ('c6400000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015','student','B1','I repaired a blue mug with my friend.','answered','counselor'),
 ('c6400000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000013','parent','R1','PRIVATE PARENT ONE','answered','counselor'),
 ('c6400000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000014','parent','R1','PRIVATE PARENT TWO','answered','counselor'),
 ('c6400000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015','student','B2','SKIPPED SENSITIVE TEXT','skip','counselor'),
 ('c6400000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015','student','B3','DISCUSS SENSITIVE TEXT','discuss','family');
INSERT INTO student_story_bank(id,firm_id,student_id,kind,title,body,audience,review_state,created_by_user_id) VALUES
 ('c6400000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','story','Confirmed repair','CONFIRMED SHARED STORY','family','confirmed','a0000000-0000-4000-8000-000000000015'),
 ('c6400000-0000-4000-8000-000000000011','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','story','Draft','UNCONFIRMED STORY','counselor','draft','a0000000-0000-4000-8000-000000000015');
INSERT INTO student_strategy_sections(id,firm_id,student_id,section_key,body,evidence,publication_state,student_review,family_shared,created_by_user_id,updated_by_user_id) VALUES
 ('c6400000-0000-4000-8000-000000000020','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','strengths','REVIEWED BRIEF','[{"kind":"bank","id":"c6400000-0000-4000-8000-000000000010","revision":1}]','shared','accurate',true,'a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012'),
 ('c6400000-0000-4000-8000-000000000021','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','counselor_notes','PRIVATE COUNSELOR NOTES','[]','draft','pending',false,'a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE c text:=pg_temp.context()::text;BEGIN
 IF c NOT LIKE '%blue mug%' OR c NOT LIKE '%REVIEWED BRIEF%' OR c LIKE '%PRIVATE%' OR c LIKE '%SENSITIVE%' OR c LIKE '%UNCONFIRMED%' THEN RAISE EXCEPTION 'Staff recipient context leaked or omitted material: %',c;END IF;
 IF NOT (pg_temp.context()->'excludedQuestionKeys' ?& ARRAY['B2','B3']) THEN RAISE EXCEPTION 'Question boundaries missing';END IF;
 c:=pg_temp.context('a0000000-0000-4000-8000-000000000013')::text;
 IF c NOT LIKE '%PRIVATE PARENT ONE%' OR c LIKE '%PRIVATE PARENT TWO%' OR c LIKE '%blue mug%' OR c LIKE '%PRIVATE COUNSELOR%' THEN RAISE EXCEPTION 'Parent context is not respondent-scoped';END IF;
END $$;
INSERT INTO student_ai_requests(id,firm_id,student_id,owner_user_id,recipient_user_id,mode,source_refs) VALUES
 ('c6400000-0000-4000-8000-000000000030','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000015','story',pg_temp.refs('c6400000-0000-4000-8000-000000000001'));
UPDATE student_ai_requests SET status='ready',result='{"items":[{"title":"Repair","body":"A proposed repair story","reason":"A specific experience","sourceKeys":["answer:c6400000-0000-4000-8000-000000000001"],"questionKey":null,"sectionKey":null}]}' WHERE id='c6400000-0000-4000-8000-000000000030';
SELECT public.accept_student_ai_suggestion('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c6400000-0000-4000-8000-000000000030',0,'Reviewed repair','Reviewed factual notes',0);
SELECT pg_temp.must_fail($q$SELECT public.accept_student_ai_suggestion('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c6400000-0000-4000-8000-000000000030',0,'Duplicate','Duplicate',0)$q$);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM student_story_bank WHERE title='Reviewed repair' AND review_state='draft' AND audience='counselor' AND source_answer_id='c6400000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Acceptance bypassed draft controls';END IF;
 IF NOT EXISTS(SELECT 1 FROM student_story_sources WHERE original_text='I repaired a blue mug with my friend.') THEN RAISE EXCEPTION 'Original source not retained';END IF;
END $$;
-- Parent and student cannot read another person's private AI drafts.
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_ai_requests) OR EXISTS(SELECT 1 FROM student_story_bank WHERE title='Reviewed repair') THEN RAISE EXCEPTION 'Parent read unshared AI draft';END IF;END $$;
SELECT pg_temp.must_fail($q$SELECT pg_temp.context('a0000000-0000-4000-8000-000000000014')$q$);
SELECT pg_temp.must_fail($q$SELECT public.student_ai_context('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015')$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_ai_requests) THEN RAISE EXCEPTION 'Student read counselor AI draft';END IF;END $$;
-- Changed interview text hides derived suggestions, including direct table reads.
UPDATE student_interview_answers SET answer='A corrected experience',revision=2 WHERE id='c6400000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_ai_requests) THEN RAISE EXCEPTION 'Stale AI result remained accessible';END IF;
 IF (SELECT count(*) FROM student_ai_request_usage)<>1 THEN RAISE EXCEPTION 'Withdrawal reset quota';END IF;
END $$;
SELECT pg_temp.must_fail($q$INSERT INTO student_ai_request_usage(request_id,firm_id,owner_user_id) VALUES('c6400000-0000-4000-8000-000000000030','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012')$q$);
-- Append a suggestion to existing reviewed strategy, preserving text and withdrawing sharing.
INSERT INTO student_ai_requests(id,firm_id,student_id,owner_user_id,recipient_user_id,mode,source_refs) VALUES
 ('c6400000-0000-4000-8000-000000000031','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000015','strategy',pg_temp.refs('c6400000-0000-4000-8000-000000000010'));
UPDATE student_ai_requests SET status='ready',result='{"items":[{"title":"Strengths","body":"Possible patience","reason":"Grounded in repair","sourceKeys":["bank:c6400000-0000-4000-8000-000000000010"],"questionKey":null,"sectionKey":"strengths"}]}' WHERE id='c6400000-0000-4000-8000-000000000031';
SELECT pg_temp.must_fail($q$SELECT public.accept_student_ai_suggestion('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c6400000-0000-4000-8000-000000000031',0,'Strengths','Possible patience',0)$q$);
SELECT public.accept_student_ai_suggestion('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c6400000-0000-4000-8000-000000000031',0,'Strengths','Possible patience',1);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM student_strategy_sections WHERE id='c6400000-0000-4000-8000-000000000020' AND body=E'REVIEWED BRIEF\n\nPossible patience' AND publication_state='draft' AND NOT family_shared AND student_review='pending') THEN RAISE EXCEPTION 'Strategy acceptance lost text or sharing controls';END IF;END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
UPDATE student_story_bank SET audience='counselor',revision=2 WHERE id='c6400000-0000-4000-8000-000000000010';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF pg_temp.context('a0000000-0000-4000-8000-000000000013')::text LIKE '%CONFIRMED SHARED STORY%' THEN RAISE EXCEPTION 'Withdrawn story entered parent context';END IF;END $$;
-- Parents cannot make student stories or strategy notes; neither can a
-- student impersonate staff when accepting an AI question.
SELECT pg_temp.must_fail($q$INSERT INTO student_ai_requests(firm_id,student_id,owner_user_id,recipient_user_id,mode,source_refs) VALUES('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000013','a0000000-0000-4000-8000-000000000013','story','[]')$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
SELECT pg_temp.must_fail($q$INSERT INTO student_ai_requests(firm_id,student_id,owner_user_id,recipient_user_id,mode,source_refs) VALUES('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015','a0000000-0000-4000-8000-000000000015','strategy','[]')$q$);
INSERT INTO student_ai_requests(id,firm_id,student_id,owner_user_id,recipient_user_id,mode,source_refs) VALUES
 ('c6400000-0000-4000-8000-000000000040','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015','a0000000-0000-4000-8000-000000000015','questions','[]');
UPDATE student_ai_requests SET status='ready',result='{"items":[{"title":"Explore","body":"What was that like?","reason":"Understand","sourceKeys":[],"questionKey":"B1","sectionKey":null}]}' WHERE id='c6400000-0000-4000-8000-000000000040';
SELECT pg_temp.must_fail($q$SELECT public.accept_student_ai_suggestion('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c6400000-0000-4000-8000-000000000040',0,'Question','Answer for me',0)$q$);
-- No-source questions still honor a boundary changed after generation.
UPDATE student_interview_answers SET state='skip',revision=3 WHERE id='c6400000-0000-4000-8000-000000000001';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_ai_requests) THEN RAISE EXCEPTION 'Skipped topic retained a cached AI question';END IF;END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
-- Existing two requests plus eight new attempts exhaust the hourly allowance,
-- even though the first requests are hidden by changed sources.
DO $$ BEGIN FOR n IN 1..8 LOOP
 INSERT INTO student_ai_requests(firm_id,student_id,owner_user_id,recipient_user_id,mode,source_refs)
 VALUES('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000015','questions','[]');
 END LOOP;END $$;
SELECT pg_temp.must_fail($q$INSERT INTO student_ai_requests(firm_id,student_id,owner_user_id,recipient_user_id,mode,source_refs) VALUES('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000015','questions','[]')$q$);
RESET ROLE;
DELETE FROM student_staff_assignments WHERE firm_id='a0000000-0000-4000-8000-000000000001' AND student_id='a0000000-0000-4000-8000-000000000041' AND user_id='a0000000-0000-4000-8000-000000000012';
SET LOCAL ROLE authenticated;
SELECT pg_temp.must_fail($q$SELECT pg_temp.context()$q$);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_ai_requests) THEN RAISE EXCEPTION 'Unassigned counselor retained AI access';END IF;END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_beta_owner"}',true);
SELECT pg_temp.must_fail($q$SELECT pg_temp.context()$q$);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_ai_requests) OR EXISTS(SELECT 1 FROM student_ai_request_usage) THEN RAISE EXCEPTION 'Cross-firm AI leak';END IF;END $$;
RESET ROLE;
UPDATE firm_memberships SET role='read_only_staff' WHERE user_id='a0000000-0000-4000-8000-000000000011';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_owner"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.must_fail($q$SELECT pg_temp.context()$q$);
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail($q$SELECT public.student_ai_context('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015')$q$);
ROLLBACK;
