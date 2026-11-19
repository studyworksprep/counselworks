\set ON_ERROR_STOP on
BEGIN;
INSERT INTO users(id,auth_provider_user_id,email,first_name,last_name) VALUES('c6800000-0000-4000-8000-000000000050','test_clerk_coach_readonly','coach-readonly@alpha.test','Read','Only');
INSERT INTO firm_memberships(firm_id,user_id,role,status) VALUES('a0000000-0000-4000-8000-000000000001','c6800000-0000-4000-8000-000000000050','read_only_staff','active');
CREATE FUNCTION pg_temp.must_fail(statement text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE blocked boolean:=false;BEGIN BEGIN EXECUTE statement;EXCEPTION WHEN insufficient_privilege OR check_violation OR raise_exception OR unique_violation THEN blocked:=true;END;
 IF NOT blocked THEN RAISE EXCEPTION 'Expected rejection: %',statement;END IF;END $$;
INSERT INTO essay_drafts(id,firm_id,student_id,essay_type,title,prompt_text,body,status,visibility_scope,created_by_user_id,updated_by_user_id,current_version_number) VALUES
 ('c6800000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','supplemental','Saved coaching','Describe a decision.','WORKING TEXT IS NOT THE SAVED VERSION','draft','family','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012',2),
 ('c6800000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','supplemental','Other essay','Another question.','OTHER ESSAY','draft','student','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012',1);
INSERT INTO essay_draft_versions(id,essay_draft_id,version_number,body,created_by_user_id) VALUES
 ('c6800000-0000-4000-8000-000000000020','c6800000-0000-4000-8000-000000000001',1,'I tried again. The seedlings survived.','a0000000-0000-4000-8000-000000000015'),
 ('c6800000-0000-4000-8000-000000000021','c6800000-0000-4000-8000-000000000001',2,'A LATER SAVED BODY','a0000000-0000-4000-8000-000000000015'),
 ('c6800000-0000-4000-8000-000000000022','c6800000-0000-4000-8000-000000000002',1,'OTHER SAVED ESSAY','a0000000-0000-4000-8000-000000000015');
INSERT INTO student_story_bank(id,firm_id,student_id,kind,title,body,audience,review_state,created_by_user_id) VALUES
 ('c6800000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','story','Repair','The club tested a new layout.','counselor','confirmed','a0000000-0000-4000-8000-000000000015');
INSERT INTO student_interview_answers(id,firm_id,student_id,respondent_user_id,respondent_kind,question_key,answer,state,audience) VALUES
 ('c6800000-0000-4000-8000-000000000011','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','a0000000-0000-4000-8000-000000000015','student','B1','A decision in the garden.','answered','counselor');
CREATE FUNCTION pg_temp.coach_refs() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_agg(jsonb_build_object('kind',s->'kind','id',s->'id','revision',s->'revision','stamp',s->'stamp')) FROM jsonb_array_elements(public.essay_ai_sources('a0000000-0000-4000-8000-000000000001',public.current_user_id(),'a0000000-0000-4000-8000-000000000041',false)) s WHERE s->>'id' IN ('c6800000-0000-4000-8000-000000000010','c6800000-0000-4000-8000-000000000011') $$;
CREATE FUNCTION pg_temp.coach_request() RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE request uuid;BEGIN
 INSERT INTO essay_coach_requests(firm_id,student_id,essay_id,version_id,owner_user_id,source_refs,task_stamp)
 VALUES('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','c6800000-0000-4000-8000-000000000001','c6800000-0000-4000-8000-000000000020',public.current_user_id(),pg_temp.coach_refs(),public.essay_coach_stamp('a0000000-0000-4000-8000-000000000001',public.current_user_id(),'c6800000-0000-4000-8000-000000000001','c6800000-0000-4000-8000-000000000020')) RETURNING id INTO request;
 RETURN request;END $$;
CREATE FUNCTION pg_temp.ready_coaching(request uuid) RETURNS void LANGUAGE sql AS $$
 UPDATE essay_coach_requests SET status='ready',result='{"assessment":"Explore meaning in your own words.","suggestions":[{"category":"specificity","quote":"I tried again.","observation":"The next attempt is visible.","question":"What changed?","sourceKeys":["bank:c6800000-0000-4000-8000-000000000010"]},{"category":"voice_consistency","quote":null,"observation":"Consider which detail matters.","question":"Which choice felt like yours?","sourceKeys":["bank:c6800000-0000-4000-8000-000000000010"]}],"gaps":[]}' WHERE id=request $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.must_fail($q$UPDATE essay_draft_versions SET body='Rewritten snapshot' WHERE id='c6800000-0000-4000-8000-000000000020'$q$);
SELECT pg_temp.must_fail($q$DELETE FROM essay_draft_versions WHERE id='c6800000-0000-4000-8000-000000000020'$q$);
DO $$DECLARE req uuid; f uuid; before_stamp text; BEGIN
 req:=pg_temp.coach_request();PERFORM pg_temp.ready_coaching(req);
 before_stamp:=public.essay_coach_stamp('a0000000-0000-4000-8000-000000000001',public.current_user_id(),'c6800000-0000-4000-8000-000000000001','c6800000-0000-4000-8000-000000000020');
 f:=public.publish_essay_coaching('a0000000-0000-4000-8000-000000000001',public.current_user_id(),req,0,'The counselor edited this question before publishing.');
 PERFORM set_config('coach.request',req::text,true);PERFORM set_config('coach.feedback',f::text,true);PERFORM set_config('coach.stamp',before_stamp,true);
 PERFORM set_config('coach.task',public.create_essay_revision_task('a0000000-0000-4000-8000-000000000001',public.current_user_id(),f,'Explore the saved choice','Choose your own details.',NULL)::text,true);
 IF NOT EXISTS(SELECT 1 FROM essay_feedback WHERE id=f AND body='The counselor edited this question before publishing.' AND quoted_text='I tried again.' AND version_number=1 AND jsonb_array_length(ai_source_refs)=2) THEN RAISE EXCEPTION 'Reviewed feedback lost version, edit, quote or selected provenance'; END IF;
 PERFORM pg_temp.must_fail(format('SELECT public.publish_essay_coaching(%L,%L,%L,0,%L)','a0000000-0000-4000-8000-000000000001',public.current_user_id(),req,'duplicate'));
 PERFORM pg_temp.must_fail(format('UPDATE essay_feedback SET ai_source_refs=''[]'' WHERE id=%L',f));
 PERFORM pg_temp.must_fail(format('UPDATE essay_coach_requests SET version_id=%L WHERE id=%L','c6800000-0000-4000-8000-000000000021',req));
 PERFORM pg_temp.must_fail(format('INSERT INTO essay_coach_request_usage(request_id,firm_id,owner_user_id) VALUES(%L,%L,%L)',gen_random_uuid(),'a0000000-0000-4000-8000-000000000001',public.current_user_id()));
END $$;
-- Later working/saved text cannot silently replace the body being reviewed.
RESET ROLE;
UPDATE essay_drafts SET body='NEW WORKING TEXT',current_version_number=3 WHERE id='c6800000-0000-4000-8000-000000000001';
INSERT INTO essay_draft_versions(essay_draft_id,version_number,body,created_by_user_id) VALUES('c6800000-0000-4000-8000-000000000001',3,'A THIRD SAVED BODY','a0000000-0000-4000-8000-000000000015');
SET LOCAL ROLE authenticated;
DO $$BEGIN
 IF public.essay_coach_stamp('a0000000-0000-4000-8000-000000000001',public.current_user_id(),'c6800000-0000-4000-8000-000000000001','c6800000-0000-4000-8000-000000000020')<>current_setting('coach.stamp') THEN RAISE EXCEPTION 'Later writing invalidated an unchanged chosen saved version';END IF;
 PERFORM public.publish_essay_coaching('a0000000-0000-4000-8000-000000000001',public.current_user_id(),current_setting('coach.request')::uuid,1,'Another reviewed question.');
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM essay_coach_requests) OR (SELECT count(*) FROM essay_feedback WHERE essay_draft_id='c6800000-0000-4000-8000-000000000001')<>2 THEN RAISE EXCEPTION 'Private requests leaked or published feedback disappeared';END IF;
 IF NOT EXISTS(SELECT 1 FROM tasks WHERE id=current_setting('coach.task')::uuid) THEN RAISE EXCEPTION 'Published revision task missing for its student';END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$BEGIN IF EXISTS(SELECT 1 FROM essay_coach_requests) OR EXISTS(SELECT 1 FROM essay_feedback WHERE essay_draft_id='c6800000-0000-4000-8000-000000000001') OR EXISTS(SELECT 1 FROM essay_draft_versions WHERE essay_draft_id='c6800000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Family essay sharing published private coaching or saved versions';END IF;END $$;
SELECT pg_temp.must_fail($q$SELECT public.essay_coach_stamp('a0000000-0000-4000-8000-000000000001',public.current_user_id(),'c6800000-0000-4000-8000-000000000001','c6800000-0000-4000-8000-000000000020')$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent2"}',true);
DO $$BEGIN IF EXISTS(SELECT 1 FROM essay_coach_requests) OR EXISTS(SELECT 1 FROM essay_feedback WHERE essay_draft_id='c6800000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Second parent coaching boundary failed';END IF;END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_beta_owner"}',true);
SELECT pg_temp.must_fail($q$SELECT public.essay_coach_stamp('a0000000-0000-4000-8000-000000000001',public.current_user_id(),'c6800000-0000-4000-8000-000000000001','c6800000-0000-4000-8000-000000000020')$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
DO $$DECLARE req uuid;BEGIN
 req:=pg_temp.coach_request();
 PERFORM pg_temp.must_fail(format('UPDATE essay_coach_requests SET status=''ready'',result=%L::jsonb WHERE id=%L','{"suggestions":[{"quote":"MADE UP QUOTE","sourceKeys":["bank:c6800000-0000-4000-8000-000000000010"]}]}',req));
 PERFORM pg_temp.must_fail(format('UPDATE essay_coach_requests SET status=''ready'',result=%L::jsonb WHERE id=%L','{"suggestions":[{"quote":null,"sourceKeys":["bank:c6800000-0000-4000-8000-000000000099"]}]}',req));
 UPDATE essay_coach_requests SET status='failed' WHERE id=req;
 PERFORM pg_temp.must_fail($q$INSERT INTO essay_coach_requests(firm_id,student_id,essay_id,version_id,owner_user_id,source_refs,task_stamp) VALUES('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','c6800000-0000-4000-8000-000000000001','c6800000-0000-4000-8000-000000000022',public.current_user_id(),pg_temp.coach_refs(),current_setting('coach.stamp'))$q$);
END $$;
-- Whole-essay deletion still works when no revision work depends on feedback.
DO $$DECLARE req uuid;BEGIN
 INSERT INTO essay_coach_requests(firm_id,student_id,essay_id,version_id,owner_user_id,source_refs,task_stamp)
 VALUES('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','c6800000-0000-4000-8000-000000000002','c6800000-0000-4000-8000-000000000022',public.current_user_id(),pg_temp.coach_refs(),public.essay_coach_stamp('a0000000-0000-4000-8000-000000000001',public.current_user_id(),'c6800000-0000-4000-8000-000000000002','c6800000-0000-4000-8000-000000000022')) RETURNING id INTO req;
 UPDATE essay_coach_requests SET status='ready',result='{"assessment":"Explore a question.","suggestions":[{"category":"specificity","quote":null,"observation":"More detail may help.","question":"What mattered?","sourceKeys":["bank:c6800000-0000-4000-8000-000000000010"]}],"gaps":[]}' WHERE id=req;
 PERFORM public.publish_essay_coaching('a0000000-0000-4000-8000-000000000001',public.current_user_id(),req,0,'Reviewed historical feedback.');
 DELETE FROM essay_drafts WHERE id='c6800000-0000-4000-8000-000000000002' AND firm_id='a0000000-0000-4000-8000-000000000001';
END $$;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_coach_readonly"}',true);
SELECT pg_temp.must_fail($q$SELECT public.essay_coach_stamp('a0000000-0000-4000-8000-000000000001',public.current_user_id(),'c6800000-0000-4000-8000-000000000001','c6800000-0000-4000-8000-000000000020')$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
-- Withdrawal hides private output, but cannot erase the student's own working
-- feedback merely because their story needs another review.
RESET ROLE;
UPDATE student_story_bank SET review_state='revisit',revision=revision+1 WHERE id='c6800000-0000-4000-8000-000000000010';
SET LOCAL ROLE authenticated;
DO $$BEGIN IF EXISTS(SELECT 1 FROM essay_coach_requests WHERE id=current_setting('coach.request')::uuid) THEN RAISE EXCEPTION 'Stale coaching remained visible';END IF;END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DO $$BEGIN IF (SELECT count(*) FROM essay_feedback WHERE essay_draft_id='c6800000-0000-4000-8000-000000000001')<>2 THEN RAISE EXCEPTION 'Review flag erased the student working discussion';END IF;END $$;
RESET ROLE;
DELETE FROM student_story_bank WHERE id='c6800000-0000-4000-8000-000000000010';
SET LOCAL ROLE authenticated;
DO $$BEGIN IF EXISTS(SELECT 1 FROM essay_feedback WHERE essay_draft_id='c6800000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Unavailable source still exposed derived feedback';END IF;END $$;
DO $$BEGIN IF EXISTS(SELECT 1 FROM tasks WHERE id=current_setting('coach.task')::uuid) THEN RAISE EXCEPTION 'Unavailable source still exposed derived revision work';END IF;END $$;
RESET ROLE;
DO $$BEGIN
 IF NOT current_setting('coach.task')::uuid=ANY(public.essay_coach_hidden_tasks('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015')) THEN RAISE EXCEPTION 'Fallback task filtering missed withdrawn coaching';END IF;
 IF (SELECT body FROM essay_draft_versions WHERE id='c6800000-0000-4000-8000-000000000020')<>'I tried again. The seedlings survived.' OR (SELECT body FROM essay_drafts WHERE id='c6800000-0000-4000-8000-000000000001')<>'NEW WORKING TEXT' THEN RAISE EXCEPTION 'Coaching changed student writing';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('essay_coach_stamp','publish_essay_coaching','essay_coach_hidden_tasks','guard_essay_coach_request','guard_essay_coach_feedback','record_essay_coach_usage','guard_coaching_revision_context') AND (prosecdef OR NOT proconfig @> ARRAY['search_path=public'] OR has_function_privilege('anon',oid,'EXECUTE'))) THEN RAISE EXCEPTION 'Unsafe coaching function privileges';END IF;
END $$;
ROLLBACK;
