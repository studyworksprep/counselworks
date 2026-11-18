\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.must_fail(statement text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN insufficient_privilege OR check_violation OR raise_exception OR foreign_key_violation THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Expected rejection: %',statement; END IF;
END $$;
-- Ordinary acceptance saves supply the current displayed revisions; the stale
-- source test below deliberately calls the RPC with an older snapshot.
CREATE FUNCTION pg_temp.save_plan(f uuid,a uuid,e uuid,r integer,expected uuid[],entries uuid[],approach text,angle text,review text,family boolean)
RETURNS integer LANGUAGE sql SECURITY INVOKER AS $$
 SELECT public.save_essay_plan(f,a,e,r,expected,entries,approach,angle,review,family,
  (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision)),'[]'::jsonb) FROM student_story_bank WHERE firm_id=f AND id=ANY(entries)));
$$;
INSERT INTO essay_drafts(id,firm_id,student_id,essay_type,title,body,status,word_count_target,character_count_limit,visibility_scope,created_by_user_id,updated_by_user_id) VALUES
 ('c5900000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','supplemental','First response','Keep original writing','draft',250,1000,'family','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012'),
 ('c5900000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','supplemental','Second response','','draft',100,200,'student','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012'),
 ('c5900000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','supplemental','Staff private response','','draft',100,NULL,'staff','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012'),
 ('c5900000-0000-4000-8000-000000000099','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000041','supplemental','Other firm response','','draft',100,NULL,'family','b0000000-0000-4000-8000-000000000012','b0000000-0000-4000-8000-000000000012');
INSERT INTO essay_draft_versions(essay_draft_id,version_number,body,created_by_user_id) VALUES ('c5900000-0000-4000-8000-000000000001',1,'Keep original writing','a0000000-0000-4000-8000-000000000012');
INSERT INTO student_story_bank(id,firm_id,student_id,kind,title,body,audience,review_state,created_by_user_id,story_ids) VALUES
 ('c5900000-0000-4000-8000-000000000010','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','story','Shared story','A scene','family','confirmed','a0000000-0000-4000-8000-000000000015','{}'),
 ('c5900000-0000-4000-8000-000000000011','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','narrative','Shared narrative','A thread','family','confirmed','a0000000-0000-4000-8000-000000000015',ARRAY['c5900000-0000-4000-8000-000000000010'::uuid]),
 ('c5900000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','story','Private story','Private scene','counselor','confirmed','a0000000-0000-4000-8000-000000000015','{}'),
 ('c5900000-0000-4000-8000-000000000090','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000041','story','Other firm story','Other scene','family','confirmed','b0000000-0000-4000-8000-000000000015','{}');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.save_plan('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c5900000-0000-4000-8000-000000000001',0,'{}',ARRAY['c5900000-0000-4000-8000-000000000010','c5900000-0000-4000-8000-000000000011']::uuid[],'experience','A distinct angle','draft',false);
DO $$ BEGIN
 IF (SELECT count(*) FROM student_story_essay_links WHERE essay_id='c5900000-0000-4000-8000-000000000001')<>2 THEN RAISE EXCEPTION 'Story and narrative not connected'; END IF;
END $$;
SELECT pg_temp.must_fail($q$SELECT pg_temp.save_plan('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c5900000-0000-4000-8000-000000000001',1,ARRAY['c5900000-0000-4000-8000-000000000010','c5900000-0000-4000-8000-000000000011']::uuid[],ARRAY['c5900000-0000-4000-8000-000000000010']::uuid[],'experience','Staff approval forgery','confirmed',true)$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_essay_plans) THEN RAISE EXCEPTION 'Parent read unapproved note'; END IF; END $$;
SELECT pg_temp.must_fail($q$SELECT pg_temp.save_plan('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000013','c5900000-0000-4000-8000-000000000001',1,'{}','{}','research','Parent rewrite','draft',false)$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
SELECT pg_temp.save_plan('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c5900000-0000-4000-8000-000000000001',1,ARRAY['c5900000-0000-4000-8000-000000000010','c5900000-0000-4000-8000-000000000011']::uuid[],ARRAY['c5900000-0000-4000-8000-000000000010','c5900000-0000-4000-8000-000000000011']::uuid[],'experience','Student-reviewed angle','confirmed',true);
SELECT pg_temp.must_fail($q$SELECT pg_temp.save_plan('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c5900000-0000-4000-8000-000000000001',1,'{}','{}','research','Stale writer','draft',false)$q$);
-- A rejected family-sharing change must roll back both connection replacements
-- and the intermediate trigger updates, preserving the original approval.
SELECT pg_temp.must_fail($q$SELECT pg_temp.save_plan('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c5900000-0000-4000-8000-000000000001',2,ARRAY['c5900000-0000-4000-8000-000000000010','c5900000-0000-4000-8000-000000000011']::uuid[],ARRAY['c5900000-0000-4000-8000-000000000012']::uuid[],'experience','Must roll back','confirmed',true)$q$);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM student_essay_plans WHERE essay_id='c5900000-0000-4000-8000-000000000001' AND revision=2 AND angle='Student-reviewed angle' AND family_shared) THEN RAISE EXCEPTION 'Failed save partially changed plan'; END IF;
 IF (SELECT count(*) FROM student_story_essay_links WHERE essay_id='c5900000-0000-4000-8000-000000000001')<>2 THEN RAISE EXCEPTION 'Failed save changed connections'; END IF;
END $$;
SELECT pg_temp.must_fail($q$SELECT pg_temp.save_plan('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c5900000-0000-4000-8000-000000000002',0,'{}',ARRAY['c5900000-0000-4000-8000-000000000090']::uuid[],'experience','Wrong student source','draft',false)$q$);
SELECT pg_temp.must_fail($q$UPDATE student_essay_plans SET source_versions='[{"id":"c5900000-0000-4000-8000-000000000010","revision":null}]',revision=3,updated_by_user_id='a0000000-0000-4000-8000-000000000015' WHERE essay_id='c5900000-0000-4000-8000-000000000001'$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF (SELECT count(*) FROM student_essay_plans)<>1 THEN RAISE EXCEPTION 'Approved plan not visible'; END IF; END $$;
UPDATE student_essay_plans SET angle='Parent rewrite',revision=3 WHERE essay_id='c5900000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent2"}',true);
DO $$ BEGIN IF (SELECT count(*) FROM student_essay_plans)<>1 OR EXISTS(SELECT 1 FROM student_essay_plans WHERE angle='Parent rewrite') THEN RAISE EXCEPTION 'Parent ownership failure'; END IF; END $$;
-- Adding a private connection must hide the previously approved note even
-- though a parent's RLS cannot count that newly private connection.
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
INSERT INTO student_story_essay_links(firm_id,student_id,entry_id,essay_id,created_by_user_id) VALUES ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','c5900000-0000-4000-8000-000000000012','c5900000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015');
SELECT pg_temp.must_fail($q$UPDATE student_essay_plans SET review_state='confirmed',family_shared=true,revision=4,updated_by_user_id='a0000000-0000-4000-8000-000000000015' WHERE essay_id='c5900000-0000-4000-8000-000000000001'$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_essay_plans) THEN RAISE EXCEPTION 'Private connection left old note approved'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DELETE FROM student_story_essay_links WHERE entry_id='c5900000-0000-4000-8000-000000000012' AND essay_id='c5900000-0000-4000-8000-000000000001';
SELECT pg_temp.save_plan('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c5900000-0000-4000-8000-000000000001',4,ARRAY['c5900000-0000-4000-8000-000000000010','c5900000-0000-4000-8000-000000000011']::uuid[],ARRAY['c5900000-0000-4000-8000-000000000010','c5900000-0000-4000-8000-000000000011']::uuid[],'experience','Explicitly reviewed again','confirmed',true);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SELECT pg_temp.save_plan('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c5900000-0000-4000-8000-000000000001',5,ARRAY['c5900000-0000-4000-8000-000000000010','c5900000-0000-4000-8000-000000000011']::uuid[],ARRAY['c5900000-0000-4000-8000-000000000010','c5900000-0000-4000-8000-000000000011']::uuid[],'experience','Counselor proposed revision','draft',false);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent2"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_essay_plans) THEN RAISE EXCEPTION 'Counselor revision remained family-visible'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
SELECT pg_temp.save_plan('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c5900000-0000-4000-8000-000000000001',6,ARRAY['c5900000-0000-4000-8000-000000000010','c5900000-0000-4000-8000-000000000011']::uuid[],ARRAY['c5900000-0000-4000-8000-000000000010','c5900000-0000-4000-8000-000000000011']::uuid[],'experience','Current source review','confirmed',true);
UPDATE student_story_bank SET body='New version of scene',revision=2 WHERE id='c5900000-0000-4000-8000-000000000010';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_essay_plans) THEN RAISE EXCEPTION 'Changed story left note visible'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
UPDATE student_story_bank SET review_state='confirmed',revision=3 WHERE id='c5900000-0000-4000-8000-000000000011';
SELECT pg_temp.must_fail($q$SELECT public.save_essay_plan('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c5900000-0000-4000-8000-000000000001',7,ARRAY['c5900000-0000-4000-8000-000000000010','c5900000-0000-4000-8000-000000000011']::uuid[],ARRAY['c5900000-0000-4000-8000-000000000010','c5900000-0000-4000-8000-000000000011']::uuid[],'experience','Unseen source approval','confirmed',true,'[{"id":"c5900000-0000-4000-8000-000000000010","revision":1},{"id":"c5900000-0000-4000-8000-000000000011","revision":1}]')$q$);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_essay_plans WHERE angle='Unseen source approval') THEN RAISE EXCEPTION 'Stale editor approved unseen source versions'; END IF; END $$;

SELECT pg_temp.save_plan('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c5900000-0000-4000-8000-000000000001',7,ARRAY['c5900000-0000-4000-8000-000000000010','c5900000-0000-4000-8000-000000000011']::uuid[],ARRAY['c5900000-0000-4000-8000-000000000010','c5900000-0000-4000-8000-000000000011']::uuid[],'experience','Reviewed latest source versions','confirmed',true);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF (SELECT count(*) FROM student_essay_plans)<>1 THEN RAISE EXCEPTION 'Explicit renewed approval unavailable'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
UPDATE student_story_bank SET audience='counselor',revision=3 WHERE id='c5900000-0000-4000-8000-000000000010';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent2"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_essay_plans) THEN RAISE EXCEPTION 'Withdrawn supporting story leaked through a narrative plan'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SELECT pg_temp.save_plan('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c5900000-0000-4000-8000-000000000003',0,'{}',ARRAY['c5900000-0000-4000-8000-000000000010']::uuid[],'research','Private staff planning','draft',false);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_essay_plans WHERE essay_id='c5900000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Student read staff-private plan'; END IF; END $$;
SELECT pg_temp.must_fail($q$SELECT pg_temp.save_plan('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c5900000-0000-4000-8000-000000000003',1,'{}','{}','research','Private essay attack','draft',false)$q$);
SELECT pg_temp.save_plan('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c5900000-0000-4000-8000-000000000002',0,'{}','{}','research','A college-specific research angle','confirmed',false);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM essay_drafts WHERE id='c5900000-0000-4000-8000-000000000001' AND body='Keep original writing' AND status='draft' AND word_count_target=250 AND character_count_limit=1000 AND current_version_number=1 AND visibility_scope='family') THEN RAISE EXCEPTION 'Plan changed essay writing, status, limits or sharing'; END IF;
 IF (SELECT count(*) FROM essay_draft_versions WHERE essay_draft_id='c5900000-0000-4000-8000-000000000001')<>1 THEN RAISE EXCEPTION 'Planning created essay versions'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
DELETE FROM essay_drafts WHERE id='c5900000-0000-4000-8000-000000000003';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_essay_plans WHERE essay_id='c5900000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Essay delete left orphan plan'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_beta_owner"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_essay_plans) THEN RAISE EXCEPTION 'Cross-firm plan read'; END IF; END $$;
RESET ROLE;
INSERT INTO users(id,auth_provider_user_id,email,first_name,last_name) VALUES ('c5900000-0000-4000-8000-000000000050','test_planning_unassigned','planning-unassigned@example.test','Unassigned','Counselor');
INSERT INTO firm_memberships(firm_id,user_id,role) VALUES ('a0000000-0000-4000-8000-000000000001','c5900000-0000-4000-8000-000000000050','counselor');
SELECT set_config('request.jwt.claims','{"sub":"test_planning_unassigned"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM student_essay_plans) THEN RAISE EXCEPTION 'Unassigned staff plan read'; END IF; END $$;
SELECT pg_temp.must_fail($q$SELECT pg_temp.save_plan('a0000000-0000-4000-8000-000000000001','c5900000-0000-4000-8000-000000000050','c5900000-0000-4000-8000-000000000002',1,'{}','{}','research','Unassigned edit','draft',false)$q$);
RESET ROLE;
UPDATE firm_memberships SET role='read_only_staff' WHERE user_id='a0000000-0000-4000-8000-000000000011';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_owner"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM student_essay_plans)<>2 THEN RAISE EXCEPTION 'Read-only staff lost read access'; END IF; END $$;
SELECT pg_temp.must_fail($q$SELECT pg_temp.save_plan('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000011','c5900000-0000-4000-8000-000000000002',1,'{}','{}','research','Read-only edit','draft',false)$q$);
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.must_fail('SELECT * FROM student_essay_plans');
SELECT pg_temp.must_fail($q$SELECT public.essay_plan_sources_ready('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','c5900000-0000-4000-8000-000000000001','[]',false,false)$q$);
RESET ROLE;
ROLLBACK;
\echo 'Essay planning sources, consent, atomic saves, writing preservation and isolation checks passed'
