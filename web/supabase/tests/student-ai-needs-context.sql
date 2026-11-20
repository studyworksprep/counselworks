\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.must_fail(statement text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN insufficient_privilege OR check_violation OR raise_exception THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Expected rejection: %',statement; END IF;
END $$;
CREATE FUNCTION pg_temp.refs(source_id uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_agg(jsonb_build_object('kind',s->'kind','id',s->'id','revision',s->'revision','stamp',s->'stamp'))
 FROM jsonb_array_elements(public.student_ai_context('a0000000-0000-4000-8000-000000000001',public.current_user_id(),'a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015')->'sources') s WHERE s->>'id'=source_id::text
$$;
CREATE FUNCTION pg_temp.gap(source_key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('outcome','needs_more_context','items','[]'::jsonb,'contextGap',jsonb_build_object(
  'reason','The selected material does not yet describe the detail the student wants to explore.',
  'followUpQuestion','Which detail, if any, would you like to explore further?', 'sourceKeys',jsonb_build_array(source_key)))
$$;
INSERT INTO student_interview_answers(id,firm_id,student_id,respondent_user_id,respondent_kind,question_key,answer,state,audience) VALUES
 ('c7000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015','student','D1','I have not described a specific experience yet.','answered','counselor');
INSERT INTO student_story_bank(id,firm_id,student_id,kind,title,body,audience,review_state,created_by_user_id) VALUES
 ('c7000000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','story','Context-gap cited story','A modest factual account without a stated meaning.','family','confirmed','a0000000-0000-4000-8000-000000000015');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO student_ai_requests(id,firm_id,student_id,owner_user_id,recipient_user_id,mode,source_refs) VALUES
 ('c7000000-0000-4000-8000-000000000030','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000015','story',pg_temp.refs('c7000000-0000-4000-8000-000000000001')),
 ('c7000000-0000-4000-8000-000000000031','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000015','narrative',pg_temp.refs('c7000000-0000-4000-8000-000000000010')),
 ('c7000000-0000-4000-8000-000000000032','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000015','strategy',pg_temp.refs('c7000000-0000-4000-8000-000000000001'));
-- Invalid outcomes cannot be stored or downgraded into legacy proposals.
SELECT pg_temp.must_fail($q$UPDATE student_ai_requests SET status='ready',result=pg_temp.gap('answer:unselected') WHERE id='c7000000-0000-4000-8000-000000000030'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_ai_requests SET status='ready',result=jsonb_set(pg_temp.gap('answer:c7000000-0000-4000-8000-000000000001'),'{contextGap,sourceKeys}','[]') WHERE id='c7000000-0000-4000-8000-000000000030'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_ai_requests SET status='ready',result=jsonb_set(pg_temp.gap('answer:c7000000-0000-4000-8000-000000000001'),'{contextGap,sourceKeys}','["answer:c7000000-0000-4000-8000-000000000001","answer:c7000000-0000-4000-8000-000000000001"]') WHERE id='c7000000-0000-4000-8000-000000000030'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_ai_requests SET status='ready',result=jsonb_set(pg_temp.gap('answer:c7000000-0000-4000-8000-000000000001'),'{contextGap,followUpQuestion}','""') WHERE id='c7000000-0000-4000-8000-000000000030'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_ai_requests SET status='ready',result=jsonb_set(pg_temp.gap('answer:c7000000-0000-4000-8000-000000000001'),'{items}','[{"sourceKeys":["answer:c7000000-0000-4000-8000-000000000001"]}]') WHERE id='c7000000-0000-4000-8000-000000000030'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_ai_requests SET status='ready',result='{"outcome":"unknown","items":[],"contextGap":null}' WHERE id='c7000000-0000-4000-8000-000000000030'$q$);
SELECT pg_temp.must_fail($q$UPDATE student_ai_requests SET status='ready',result='{"outcome":"suggestions","items":[],"contextGap":null}' WHERE id='c7000000-0000-4000-8000-000000000030'$q$);
SELECT pg_temp.must_fail($q$DO $case$ DECLARE request uuid; BEGIN
 INSERT INTO student_ai_requests(firm_id,student_id,owner_user_id,recipient_user_id,mode,source_refs)
 VALUES('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000015','questions',pg_temp.refs('c7000000-0000-4000-8000-000000000001')) RETURNING id INTO request;
 UPDATE student_ai_requests SET status='ready',result=pg_temp.gap('answer:c7000000-0000-4000-8000-000000000001') WHERE id=request;
 END $case$ $q$);
UPDATE student_ai_requests SET status='ready',result=pg_temp.gap('answer:c7000000-0000-4000-8000-000000000001') WHERE id IN ('c7000000-0000-4000-8000-000000000030','c7000000-0000-4000-8000-000000000032');
UPDATE student_ai_requests SET status='ready',result=pg_temp.gap('bank:c7000000-0000-4000-8000-000000000010') WHERE id='c7000000-0000-4000-8000-000000000031';
-- The RPC fixes a gap's destination to a private follow-up, regardless of its
-- requested mode, caller-supplied title, or edited question text.
SELECT pg_temp.must_fail($q$SELECT public.accept_student_ai_suggestion('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c7000000-0000-4000-8000-000000000030',1,'Gap must not be a story','Reviewed context-gap question',0)$q$);
SELECT public.accept_student_ai_suggestion('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c7000000-0000-4000-8000-000000000030',0,'Gap must not be a story','Reviewed context-gap question',0);
SELECT public.accept_student_ai_suggestion('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c7000000-0000-4000-8000-000000000032',0,'Gap must not be strategy','Reviewed strategy-gap question',0);
SELECT pg_temp.must_fail($q$SELECT public.accept_student_ai_suggestion('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c7000000-0000-4000-8000-000000000030',0,'Duplicate','Duplicate',0)$q$);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM student_story_bank WHERE title='Gap must not be a story') OR EXISTS(SELECT 1 FROM student_strategy_sections WHERE body LIKE '%Reviewed strategy-gap question%') THEN RAISE EXCEPTION 'Context gap created a proposal'; END IF;
 IF NOT EXISTS(SELECT 1 FROM student_interview_followups WHERE question='Reviewed context-gap question' AND source_answer_id='c7000000-0000-4000-8000-000000000001' AND audience='counselor' AND reply='') THEN RAISE EXCEPTION 'Reviewed question bypassed follow-up controls'; END IF;
 IF NOT EXISTS(SELECT 1 FROM student_ai_requests WHERE id='c7000000-0000-4000-8000-000000000030' AND used_indices=ARRAY[0]) THEN RAISE EXCEPTION 'Gap follow-up was not single-use'; END IF;
END $$;
-- Earlier result JSON remains unchanged and can still be accepted normally.
INSERT INTO student_ai_requests(id,firm_id,student_id,owner_user_id,recipient_user_id,mode,source_refs) VALUES
 ('c7000000-0000-4000-8000-000000000034','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000015','story',pg_temp.refs('c7000000-0000-4000-8000-000000000001'));
UPDATE student_ai_requests SET status='ready',result='{"items":[{"title":"Earlier result","body":"Earlier notes","reason":"Earlier evidence","sourceKeys":["answer:c7000000-0000-4000-8000-000000000001"],"questionKey":null,"sectionKey":null}]}' WHERE id='c7000000-0000-4000-8000-000000000034';
SELECT public.accept_student_ai_suggestion('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c7000000-0000-4000-8000-000000000034',0,'Earlier reviewed result','Earlier edited notes',0);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM student_ai_requests WHERE id='c7000000-0000-4000-8000-000000000034' AND result ? 'outcome') THEN RAISE EXCEPTION 'Earlier result was rewritten'; END IF;
 IF NOT EXISTS(SELECT 1 FROM student_story_bank WHERE title='Earlier reviewed result' AND review_state='draft' AND audience='counselor') THEN RAISE EXCEPTION 'Earlier acceptance changed'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_ai_requests WHERE id::text LIKE 'c7000000%') THEN RAISE EXCEPTION 'Student read counselor-private gap'; END IF; END $$;
INSERT INTO student_ai_requests(id,firm_id,student_id,owner_user_id,recipient_user_id,mode,source_refs) VALUES
 ('c7000000-0000-4000-8000-000000000033','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015','a0000000-0000-4000-8000-000000000015','story',pg_temp.refs('c7000000-0000-4000-8000-000000000001'));
UPDATE student_ai_requests SET status='ready',result=pg_temp.gap('answer:c7000000-0000-4000-8000-000000000001') WHERE id='c7000000-0000-4000-8000-000000000033';
SELECT pg_temp.must_fail($q$SELECT public.accept_student_ai_suggestion('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c7000000-0000-4000-8000-000000000033',0,'Invented story','Invented prose',0)$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM student_ai_requests WHERE id::text LIKE 'c7000000%') OR EXISTS(SELECT 1 FROM student_interview_followups WHERE question='Reviewed context-gap question') THEN RAISE EXCEPTION 'Parent read private gap or follow-up'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
UPDATE student_interview_followups SET reply='My own detail, in my own words.',status='answered',audience='family',revision=revision+1 WHERE question='Reviewed context-gap question';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM student_interview_followups WHERE question='Reviewed context-gap question' AND reply='My own detail, in my own words.') THEN RAISE EXCEPTION 'Explicit respondent sharing failed'; END IF; END $$;
-- Changing a cited source hides gaps and refuses stale follow-up acceptance;
-- it neither resets quota nor rewrites independently reviewed questions/replies.
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
UPDATE student_story_bank SET audience='counselor',revision=revision+1 WHERE id='c7000000-0000-4000-8000-000000000010';
UPDATE student_interview_answers SET answer='A changed response',revision=revision+1 WHERE id='c7000000-0000-4000-8000-000000000001';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_ai_requests WHERE id='c7000000-0000-4000-8000-000000000033') THEN RAISE EXCEPTION 'Stale student gap remained visible'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM student_ai_requests WHERE id::text LIKE 'c7000000%') THEN RAISE EXCEPTION 'Stale counselor gaps remained visible'; END IF;
 IF (SELECT count(*) FROM student_ai_request_usage WHERE request_id::text LIKE 'c7000000%')<>4 THEN RAISE EXCEPTION 'Withdrawal changed counselor quota'; END IF;
END $$;
SELECT pg_temp.must_fail($q$SELECT public.accept_student_ai_suggestion('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c7000000-0000-4000-8000-000000000031',0,'Stale theme','Stale question',0)$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_beta_owner"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_ai_requests WHERE id::text LIKE 'c7000000%') THEN RAISE EXCEPTION 'Cross-firm context gap leaked'; END IF; END $$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail($q$SELECT public.accept_student_ai_suggestion('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c7000000-0000-4000-8000-000000000031',0,'Anonymous','Anonymous',0)$q$);
ROLLBACK;
