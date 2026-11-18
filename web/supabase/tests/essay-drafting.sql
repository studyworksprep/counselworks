\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.must_fail(statement text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE blocked boolean:=false; BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN insufficient_privilege OR check_violation OR raise_exception OR foreign_key_violation THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Expected rejection: %',statement; END IF;
END $$;
CREATE FUNCTION pg_temp.save_outline(actor uuid,essay uuid,review text DEFAULT 'draft',family boolean DEFAULT false,rev integer DEFAULT NULL) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE context jsonb; content jsonb; ids jsonb; current_revision integer;
BEGIN
 context:=public.essay_outline_context('a0000000-0000-4000-8000-000000000001',essay);
 SELECT coalesce(jsonb_agg(value->'id'),'[]'::jsonb) INTO ids FROM jsonb_array_elements(context->'source_versions');
 content:=jsonb_build_object('purpose','Reveal collaborative problem solving','beats',jsonb_build_array(jsonb_build_object('id','c6000000-0000-4000-8000-000000000030','heading','Opening','notes','Show a specific workshop scene','entry_ids',ids)));
 SELECT revision INTO current_revision FROM student_essay_outlines WHERE essay_id=essay;
 RETURN public.save_essay_outline('a0000000-0000-4000-8000-000000000001',actor,essay,coalesce(rev,current_revision,0),content,context,review,family);
END $$;
INSERT INTO essay_drafts(id,firm_id,student_id,essay_type,title,body,status,word_count_target,visibility_scope,created_by_user_id,updated_by_user_id) VALUES
 ('c6000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','supplemental','Connected writing','Original writing.','draft',250,'family','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012'),
 ('c6000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','supplemental','Private staff essay','Private writing.','draft',250,'staff','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012');
INSERT INTO essay_draft_versions(essay_draft_id,version_number,body,created_by_user_id) VALUES
 ('c6000000-0000-4000-8000-000000000001',1,'Original writing.','a0000000-0000-4000-8000-000000000012'),
 ('c6000000-0000-4000-8000-000000000002',1,'Private writing.','a0000000-0000-4000-8000-000000000012');
INSERT INTO student_story_bank(id,firm_id,student_id,kind,title,body,audience,review_state,created_by_user_id) VALUES
 ('c6000000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','story','Shared workshop','A real scene','family','confirmed','a0000000-0000-4000-8000-000000000015'),
 ('c6000000-0000-4000-8000-000000000011','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','story','Private scene','Private detail','counselor','confirmed','a0000000-0000-4000-8000-000000000015');
INSERT INTO student_story_essay_links(firm_id,student_id,entry_id,essay_id,created_by_user_id) VALUES
 ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','c6000000-0000-4000-8000-000000000010','c6000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.save_outline('a0000000-0000-4000-8000-000000000012','c6000000-0000-4000-8000-000000000001');
SELECT pg_temp.must_fail($q$SELECT pg_temp.save_outline('a0000000-0000-4000-8000-000000000012','c6000000-0000-4000-8000-000000000001','confirmed',true)$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
SELECT pg_temp.save_outline('a0000000-0000-4000-8000-000000000015','c6000000-0000-4000-8000-000000000001','confirmed',true);
SELECT pg_temp.must_fail($q$SELECT pg_temp.save_outline('a0000000-0000-4000-8000-000000000015','c6000000-0000-4000-8000-000000000001','draft',false,1)$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF (SELECT count(*) FROM student_essay_outlines WHERE essay_id='c6000000-0000-4000-8000-000000000001')<>1 THEN RAISE EXCEPTION 'Approved outline missing for first parent'; END IF; END $$;
SELECT pg_temp.must_fail($q$SELECT pg_temp.save_outline('a0000000-0000-4000-8000-000000000013','c6000000-0000-4000-8000-000000000001')$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent2"}',true);
DO $$ BEGIN IF (SELECT count(*) FROM student_essay_outlines WHERE essay_id='c6000000-0000-4000-8000-000000000001')<>1 THEN RAISE EXCEPTION 'Approved outline missing for second parent'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
UPDATE student_story_bank SET body='A revised scene',revision=2 WHERE id='c6000000-0000-4000-8000-000000000010';
SELECT pg_temp.must_fail($q$SELECT public.save_essay_outline('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c6000000-0000-4000-8000-000000000001',2,(SELECT content FROM student_essay_outlines WHERE essay_id='c6000000-0000-4000-8000-000000000001'),(SELECT context_versions FROM student_essay_outlines WHERE essay_id='c6000000-0000-4000-8000-000000000001'),'confirmed',true)$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_essay_outlines) THEN RAISE EXCEPTION 'Revised source left an approved outline visible'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
SELECT pg_temp.save_outline('a0000000-0000-4000-8000-000000000015','c6000000-0000-4000-8000-000000000001','confirmed',true);
INSERT INTO student_story_essay_links(firm_id,student_id,entry_id,essay_id,created_by_user_id) VALUES
 ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','c6000000-0000-4000-8000-000000000011','c6000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent2"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_essay_outlines) THEN RAISE EXCEPTION 'Private connection left old outline approved'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DELETE FROM student_story_essay_links WHERE essay_id='c6000000-0000-4000-8000-000000000001' AND entry_id='c6000000-0000-4000-8000-000000000011';
SELECT pg_temp.save_outline('a0000000-0000-4000-8000-000000000015','c6000000-0000-4000-8000-000000000001','confirmed',true);
-- A new private plan must revoke an outline approved while no plan existed.
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SELECT public.save_essay_plan('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c6000000-0000-4000-8000-000000000001',0,ARRAY['c6000000-0000-4000-8000-000000000010']::uuid[],ARRAY['c6000000-0000-4000-8000-000000000010']::uuid[],'experience','A new plan angle','draft',false,'[{"id":"c6000000-0000-4000-8000-000000000010","revision":2}]');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_essay_outlines) THEN RAISE EXCEPTION 'Private plan left prior outline approved'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
SELECT pg_temp.must_fail($q$SELECT pg_temp.save_outline('a0000000-0000-4000-8000-000000000015','c6000000-0000-4000-8000-000000000001','confirmed',true)$q$);
SELECT public.save_essay_plan('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c6000000-0000-4000-8000-000000000001',1,ARRAY['c6000000-0000-4000-8000-000000000010']::uuid[],ARRAY['c6000000-0000-4000-8000-000000000010']::uuid[],'experience','A reviewed plan angle','confirmed',true,'[{"id":"c6000000-0000-4000-8000-000000000010","revision":2}]');
SELECT pg_temp.save_outline('a0000000-0000-4000-8000-000000000015','c6000000-0000-4000-8000-000000000001','confirmed',true);
-- Sharing the essay alone never publishes comments or earlier versions.
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
INSERT INTO essay_feedback(id,firm_id,essay_draft_id,version_number,author_user_id,body,quoted_text,anchor_start,anchor_end) VALUES
 ('c6000000-0000-4000-8000-000000000050','a0000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000001',1,'a0000000-0000-4000-8000-000000000012','Explain the impact of the workshop.','Original',0,8);
SELECT public.create_essay_revision_task('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c6000000-0000-4000-8000-000000000050','Revise workshop impact','Show one measurable change.',NULL);
SELECT public.create_essay_revision_task('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c6000000-0000-4000-8000-000000000050','Revise workshop impact','Show one measurable change.',NULL);
SELECT pg_temp.must_fail($q$SELECT public.create_essay_revision_task('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c6000000-0000-4000-8000-000000000050','Concurrent rewrite','Later instructions must not disappear.',NULL)$q$);
SELECT pg_temp.must_fail($q$DELETE FROM essay_drafts WHERE id='c6000000-0000-4000-8000-000000000001'$q$);
SELECT pg_temp.must_fail($q$UPDATE tasks SET visibility_scope='family' WHERE essay_feedback_id='c6000000-0000-4000-8000-000000000050'$q$);
SELECT pg_temp.must_fail($q$UPDATE tasks SET essay_feedback_id=NULL WHERE essay_feedback_id='c6000000-0000-4000-8000-000000000050'$q$);
SELECT pg_temp.must_fail($q$UPDATE tasks SET assigned_user_id='a0000000-0000-4000-8000-000000000013' WHERE essay_feedback_id='c6000000-0000-4000-8000-000000000050'$q$);
SELECT pg_temp.must_fail($q$UPDATE essay_feedback SET body='Altered historical comment' WHERE id='c6000000-0000-4000-8000-000000000050'$q$);
SELECT pg_temp.must_fail($q$INSERT INTO essay_feedback(firm_id,essay_draft_id,version_number,author_user_id,body,quoted_text) VALUES('a0000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000001',1,'a0000000-0000-4000-8000-000000000012','Forged quote','Not in the saved draft')$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
SELECT pg_temp.must_fail($q$UPDATE tasks SET title='Student replaced instructions',updated_by_user_id='a0000000-0000-4000-8000-000000000015' WHERE essay_feedback_id='c6000000-0000-4000-8000-000000000050'$q$);
DO $$ DECLARE tid uuid;BEGIN
 SELECT id INTO tid FROM tasks WHERE essay_feedback_id='c6000000-0000-4000-8000-000000000050';
 IF tid IS NULL OR (SELECT count(*) FROM tasks WHERE essay_feedback_id='c6000000-0000-4000-8000-000000000050')<>1 THEN RAISE EXCEPTION 'Revision task missing or duplicated'; END IF;
 PERFORM public.transition_task('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015',tid,'completed');
 IF EXISTS(SELECT 1 FROM essay_feedback WHERE id='c6000000-0000-4000-8000-000000000050' AND resolved_at IS NOT NULL) THEN RAISE EXCEPTION 'Task completion resolved source feedback'; END IF;
END $$;
SELECT pg_temp.must_fail($q$SELECT public.create_essay_revision_task('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c6000000-0000-4000-8000-000000000050','Student assignment attack','Instructions',NULL)$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM essay_feedback WHERE id='c6000000-0000-4000-8000-000000000050') OR EXISTS(SELECT 1 FROM essay_draft_versions WHERE essay_draft_id='c6000000-0000-4000-8000-000000000001') OR EXISTS(SELECT 1 FROM tasks WHERE essay_feedback_id='c6000000-0000-4000-8000-000000000050') THEN RAISE EXCEPTION 'Family saw private coaching or history'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
UPDATE essay_drafts SET prompt_text='A changed assigned question' WHERE id='c6000000-0000-4000-8000-000000000001';
SELECT pg_temp.save_outline('a0000000-0000-4000-8000-000000000012','c6000000-0000-4000-8000-000000000002');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent2"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_essay_outlines) THEN RAISE EXCEPTION 'Changed prompt left family outline visible'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_essay_outlines WHERE essay_id='c6000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'Student saw staff-private outline'; END IF; END $$;
SELECT pg_temp.must_fail($q$SELECT pg_temp.save_outline('a0000000-0000-4000-8000-000000000015','c6000000-0000-4000-8000-000000000002')$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_beta_owner"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_essay_outlines WHERE firm_id='a0000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Cross-firm outline read'; END IF; END $$;
RESET ROLE;
UPDATE firm_memberships SET role='read_only_staff' WHERE firm_id='a0000000-0000-4000-8000-000000000001' AND user_id='a0000000-0000-4000-8000-000000000011';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_owner"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM student_essay_outlines)<>2 OR (SELECT count(*) FROM essay_feedback WHERE id='c6000000-0000-4000-8000-000000000050')<>1 THEN RAISE EXCEPTION 'Read-only staff lost coaching reads'; END IF; END $$;
SELECT pg_temp.must_fail($q$SELECT pg_temp.save_outline('a0000000-0000-4000-8000-000000000011','c6000000-0000-4000-8000-000000000001')$q$);
SELECT pg_temp.must_fail($q$SELECT public.create_essay_revision_task('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000011','c6000000-0000-4000-8000-000000000050','Read-only attack','Instructions',NULL)$q$);
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM essay_drafts WHERE id='c6000000-0000-4000-8000-000000000001' AND body='Original writing.' AND current_version_number=1 AND status='draft' AND word_count_target=250 AND visibility_scope='family') OR (SELECT count(*) FROM essay_draft_versions WHERE essay_draft_id='c6000000-0000-4000-8000-000000000001')<>1 THEN RAISE EXCEPTION 'Drafting workspace changed writing, status, limits, versions or sharing'; END IF;
END $$;
-- Submission markers observe the existing review flow; they do not create a
-- second submission process or label ordinary saves as submissions.
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
SET LOCAL ROLE authenticated;
SELECT public.write_essay('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c6000000-0000-4000-8000-000000000001','submit');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SELECT public.write_essay('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c6000000-0000-4000-8000-000000000001','revision_requested',NULL,(SELECT submitted_version_id FROM essay_drafts WHERE id='c6000000-0000-4000-8000-000000000001'),'Clarify the result.');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
SELECT public.write_essay('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c6000000-0000-4000-8000-000000000001','save','A revised result.');
SELECT public.write_essay('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c6000000-0000-4000-8000-000000000001','submit');
DO $$ BEGIN
 IF (SELECT count(*) FROM essay_submission_versions WHERE essay_id='c6000000-0000-4000-8000-000000000001')<>2 OR EXISTS(SELECT 1 FROM essay_submission_versions s JOIN essay_draft_versions v ON v.id=s.version_id WHERE s.essay_id='c6000000-0000-4000-8000-000000000001' AND v.version_number NOT IN (2,4)) THEN RAISE EXCEPTION 'Submission history mislabeled saved versions'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM essay_submission_versions) THEN RAISE EXCEPTION 'Parent read submission history'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
UPDATE essay_drafts SET visibility_scope='staff',updated_by_user_id='a0000000-0000-4000-8000-000000000012' WHERE id='c6000000-0000-4000-8000-000000000001';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM tasks WHERE essay_feedback_id='c6000000-0000-4000-8000-000000000050' AND visibility_scope<>'staff') THEN RAISE EXCEPTION 'Withdrawing essay retained a published feedback task'; END IF; END $$;
SELECT pg_temp.must_fail($q$UPDATE tasks SET visibility_scope='student' WHERE essay_feedback_id='c6000000-0000-4000-8000-000000000050'$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM tasks WHERE essay_feedback_id='c6000000-0000-4000-8000-000000000050') THEN RAISE EXCEPTION 'Student saw withdrawn coaching through task'; END IF; END $$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT * FROM student_essay_outlines');
SELECT pg_temp.must_fail('SELECT * FROM essay_submission_versions');
SELECT pg_temp.must_fail($q$SELECT public.essay_outline_context('a0000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-000000000001')$q$);
RESET ROLE;
ROLLBACK;
\echo 'Connected drafting consent, source changes, feedback tasks, history privacy and writing preservation passed'
