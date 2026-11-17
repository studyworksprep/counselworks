\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.must_fail(statement text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE blocked boolean:=false;BEGIN BEGIN EXECUTE statement;EXCEPTION WHEN insufficient_privilege OR check_violation OR raise_exception OR unique_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Expected rejection: %',statement;END IF;END $$;
CREATE FUNCTION pg_temp.sources(family boolean DEFAULT false) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.essay_ai_sources('a0000000-0000-4000-8000-000000000001',public.current_user_id(),'a0000000-0000-4000-8000-000000000041',family) $$;
CREATE FUNCTION pg_temp.refs() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_agg(jsonb_build_object('kind',s->'kind','id',s->'id','revision',s->'revision','stamp',s->'stamp')) FROM jsonb_array_elements(pg_temp.sources()) s WHERE s->>'id' IN ('c6600000-0000-4000-8000-000000000010','c6600000-0000-4000-8000-000000000011') $$;
CREATE FUNCTION pg_temp.request(mode text DEFAULT 'story_matches') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE request_id uuid;
BEGIN
 INSERT INTO essay_ai_requests(firm_id,student_id,essay_id,owner_user_id,mode,source_refs,task_stamp)
 VALUES('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','c6600000-0000-4000-8000-000000000001',public.current_user_id(),mode,pg_temp.refs(),public.essay_ai_task_stamp('a0000000-0000-4000-8000-000000000001',public.current_user_id(),'c6600000-0000-4000-8000-000000000001')) RETURNING id INTO request_id;
 UPDATE essay_ai_requests SET status='ready',result='{"matches":[{"entryIds":["c6600000-0000-4000-8000-000000000010"]}]}' WHERE id=request_id;
 RETURN request_id;
END $$;
CREATE FUNCTION pg_temp.plan(review text DEFAULT 'confirmed',family boolean DEFAULT false,refs jsonb DEFAULT NULL) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE p student_essay_plans;
BEGIN
 SELECT * INTO p FROM student_essay_plans WHERE firm_id='a0000000-0000-4000-8000-000000000001' AND essay_id='c6600000-0000-4000-8000-000000000001';
 RETURN public.save_essay_plan(p.firm_id,public.current_user_id(),p.essay_id,p.revision,ARRAY['c6600000-0000-4000-8000-000000000010']::uuid[],ARRAY['c6600000-0000-4000-8000-000000000010']::uuid[],'experience',p.angle,review,family,p.source_versions,refs);
END $$;
CREATE FUNCTION pg_temp.outline() RETURNS jsonb LANGUAGE sql AS $$
 SELECT '{"purpose":"What did trying another design change?","beats":[{"id":"c6600000-0000-4000-8000-000000000030","heading":"The choice","notes":"Which choice mattered?","entry_ids":["c6600000-0000-4000-8000-000000000010"]}]}'::jsonb $$;
INSERT INTO essay_drafts(id,firm_id,student_id,essay_type,title,prompt_text,body,status,word_count_target,visibility_scope,created_by_user_id,updated_by_user_id) VALUES
 ('c6600000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','supplemental','Context planning','Describe a decision.','STUDENT ORIGINAL WRITING','draft',250,'family','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012');
INSERT INTO student_story_bank(id,firm_id,student_id,kind,title,body,audience,review_state,created_by_user_id) VALUES
 ('c6600000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','story','Real repair','I tried three designs.','family','confirmed','a0000000-0000-4000-8000-000000000015');
INSERT INTO student_interview_answers(id,firm_id,student_id,respondent_user_id,respondent_kind,question_key,answer,state,audience) VALUES
 ('c6600000-0000-4000-8000-000000000011','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015','student','B1','PRIVATE STUDENT CONTEXT','answered','counselor'),
 ('c6600000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000013','parent','R1','PARENT VOICE NEVER AUTOBIOGRAPHY','answered','family');
INSERT INTO student_strategy_sections(firm_id,student_id,section_key,body,publication_state,created_by_user_id,updated_by_user_id) VALUES
 ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','counselor_notes','PRIVATE COUNSELOR NOTES','draft','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE req uuid; BEGIN
 IF pg_temp.sources() IS DISTINCT FROM (public.student_ai_context('a0000000-0000-4000-8000-000000000001',public.current_user_id(),'a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015')->'sources') THEN RAISE EXCEPTION 'Essay context drifted from shared interview evidence';END IF;
 IF pg_temp.sources()::text NOT LIKE '%PRIVATE STUDENT%' OR pg_temp.sources()::text LIKE '%PARENT VOICE%' OR pg_temp.sources()::text LIKE '%PRIVATE COUNSELOR%' THEN RAISE EXCEPTION 'Student source boundary failed';END IF;
 req:=pg_temp.request();
 PERFORM public.accept_essay_ai_suggestion('a0000000-0000-4000-8000-000000000001',public.current_user_id(),req,0,'Which decision changed the next attempt?',NULL);
 PERFORM pg_temp.must_fail(format('SELECT public.accept_essay_ai_suggestion(%L,%L,%L,0,%L,NULL)','a0000000-0000-4000-8000-000000000001',public.current_user_id(),req,'Duplicate'));
 IF NOT EXISTS(SELECT 1 FROM student_essay_plans WHERE essay_id='c6600000-0000-4000-8000-000000000001' AND review_state='draft' AND NOT family_shared AND jsonb_array_length(ai_source_refs)=2) THEN RAISE EXCEPTION 'AI acceptance bypassed provenance or draft controls';END IF;
END $$;
SELECT pg_temp.must_fail($q$SELECT pg_temp.plan('confirmed',false)$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
SELECT pg_temp.plan();
SELECT pg_temp.must_fail($q$SELECT pg_temp.plan('confirmed',true)$q$);
-- Both parents see only family-eligible sources, no private suggestions/plan.
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN
 IF pg_temp.sources(false)::text LIKE '%PRIVATE STUDENT%' OR EXISTS(SELECT 1 FROM essay_ai_requests) OR EXISTS(SELECT 1 FROM student_essay_plans) THEN RAISE EXCEPTION 'Parent read private derived context';END IF;
END $$;
SELECT pg_temp.must_fail($q$SELECT pg_temp.request()$q$);
SELECT pg_temp.must_fail($q$SELECT public.essay_ai_task_stamp('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c6600000-0000-4000-8000-000000000001')$q$);
-- Sharing a source changes its stamp. It requires explicit citation review.
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
UPDATE student_interview_answers SET audience='family',revision=revision+1 WHERE id='c6600000-0000-4000-8000-000000000011';
SELECT pg_temp.must_fail($q$SELECT pg_temp.plan('confirmed',true)$q$);
SELECT pg_temp.plan('confirmed',true,pg_temp.refs());
DO $$ DECLARE req uuid; BEGIN
 req:=pg_temp.request('outline');
 PERFORM public.accept_essay_ai_suggestion('a0000000-0000-4000-8000-000000000001',public.current_user_id(),req,0,'',pg_temp.outline());
 IF NOT EXISTS(SELECT 1 FROM student_essay_outlines WHERE essay_id='c6600000-0000-4000-8000-000000000001' AND review_state='draft' AND NOT family_shared AND jsonb_array_length(ai_source_refs)=2) THEN RAISE EXCEPTION 'Outline acceptance bypassed review';END IF;
END $$;
SELECT public.save_essay_outline('a0000000-0000-4000-8000-000000000001',public.current_user_id(),'c6600000-0000-4000-8000-000000000001',1,pg_temp.outline(),public.essay_outline_context('a0000000-0000-4000-8000-000000000001','c6600000-0000-4000-8000-000000000001'),'confirmed',true);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF (SELECT count(*) FROM student_essay_plans)<>1 OR (SELECT count(*) FROM student_essay_outlines)<>1 THEN RAISE EXCEPTION 'Reviewed shared artifacts missing';END IF;END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent2"}',true);
DO $$ BEGIN IF (SELECT count(*) FROM student_essay_plans)<>1 OR (SELECT count(*) FROM student_essay_outlines)<>1 THEN RAISE EXCEPTION 'Second parent sharing differs';END IF;END $$;
-- A review flag is not an authorization withdrawal: students keep their notes.
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
UPDATE student_story_bank SET review_state='revisit',revision=2 WHERE id='c6600000-0000-4000-8000-000000000010';
DO $$ BEGIN IF (SELECT count(*) FROM student_essay_plans)<>1 OR (SELECT count(*) FROM student_essay_outlines)<>1 THEN RAISE EXCEPTION 'Review flag hid the student working drafts';END IF;END $$;
SELECT pg_temp.must_fail($q$SELECT pg_temp.plan('confirmed',true)$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_essay_plans) OR EXISTS(SELECT 1 FROM student_essay_outlines) THEN RAISE EXCEPTION 'Unreviewed source left derived family access';END IF;END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
UPDATE student_story_bank SET review_state='confirmed',revision=3 WHERE id='c6600000-0000-4000-8000-000000000010';
-- Changes while a suggestion is waiting invalidate it; no essay body writes.
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
DO $$ DECLARE req uuid; BEGIN
 req:=pg_temp.request();
 UPDATE essay_drafts SET prompt_text='A different assigned prompt' WHERE id='c6600000-0000-4000-8000-000000000001';
 PERFORM pg_temp.must_fail(format('SELECT public.accept_essay_ai_suggestion(%L,%L,%L,0,%L,NULL)','a0000000-0000-4000-8000-000000000001',public.current_user_id(),req,'Stale'));
 IF EXISTS(SELECT 1 FROM essay_ai_requests WHERE id=req) THEN RAISE EXCEPTION 'Stale request remained readable';END IF;
 IF (SELECT body FROM essay_drafts WHERE id='c6600000-0000-4000-8000-000000000001')<>'STUDENT ORIGINAL WRITING' THEN RAISE EXCEPTION 'AI changed essay writing';END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
UPDATE student_interview_answers SET audience='counselor',revision=revision+1 WHERE id='c6600000-0000-4000-8000-000000000011';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_essay_plans) OR EXISTS(SELECT 1 FROM student_essay_outlines) THEN RAISE EXCEPTION 'Withdrawal left derived artifacts exposed';END IF;END $$;
-- Removing assignment blocks an existing request even for the same firm.
RESET ROLE;
DELETE FROM student_staff_assignments WHERE firm_id='a0000000-0000-4000-8000-000000000001' AND student_id='a0000000-0000-4000-8000-000000000041' AND user_id='a0000000-0000-4000-8000-000000000012';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.must_fail('SELECT pg_temp.sources()');
DO $$ BEGIN IF EXISTS(SELECT 1 FROM essay_ai_requests) THEN RAISE EXCEPTION 'Unassigned counselor retained suggestions';END IF;END $$;
RESET ROLE;
INSERT INTO student_staff_assignments(firm_id,student_id,user_id,assignment_type) VALUES('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000012','counselor');
SET LOCAL ROLE authenticated;
-- Source withdrawal cannot reset the shared interview + essay request allowance.
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
DO $$ DECLARE i integer; BEGIN
 FOR i IN 1..7 LOOP PERFORM pg_temp.request();END LOOP;
 -- Counselor has nine requests; student has one. These quotas are per owner.
 PERFORM pg_temp.request();
 PERFORM pg_temp.must_fail('SELECT pg_temp.request()');
 IF (SELECT count(*) FROM essay_ai_request_usage WHERE owner_user_id=public.current_user_id())<>10 THEN RAISE EXCEPTION 'Quota lost withdrawn requests';END IF;
END $$;
SELECT pg_temp.must_fail($q$INSERT INTO student_ai_requests(firm_id,student_id,owner_user_id,recipient_user_id,mode,source_refs) VALUES('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000015','questions','[]')$q$);
SELECT pg_temp.must_fail($q$INSERT INTO essay_ai_request_usage(request_id,firm_id,owner_user_id) VALUES(gen_random_uuid(),'a0000000-0000-4000-8000-000000000001',public.current_user_id())$q$);
-- Existing firm-wide read-only staff keep source/artifact reads, never generation.
RESET ROLE;
UPDATE firm_memberships SET role='read_only_staff' WHERE firm_id='a0000000-0000-4000-8000-000000000001' AND user_id='a0000000-0000-4000-8000-000000000012';
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF jsonb_array_length(pg_temp.sources())=0 OR (SELECT count(*) FROM student_essay_plans)<>1 THEN RAISE EXCEPTION 'Read-only staff lost existing planning access';END IF;END $$;
SELECT pg_temp.must_fail('SELECT pg_temp.request()');
RESET ROLE;
UPDATE firm_memberships SET role='counselor' WHERE firm_id='a0000000-0000-4000-8000-000000000001' AND user_id='a0000000-0000-4000-8000-000000000012';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_beta_counselor"}',true);
SELECT pg_temp.must_fail($q$SELECT pg_temp.sources()$q$);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM essay_ai_requests) OR EXISTS(SELECT 1 FROM student_essay_plans) THEN RAISE EXCEPTION 'Cross-firm access';END IF;END $$;
ROLLBACK;
