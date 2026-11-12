\set ON_ERROR_STOP on
BEGIN;
INSERT INTO colleges(id,name,slug,scorecard_id) VALUES
 ('d1000000-0000-4000-8000-000000000001','Workspace test college','workspace-test-college',999950),
 ('d1000000-0000-4000-8000-000000000002','Workspace second college','workspace-second-college',999951);
INSERT INTO college_prompt_sets(id,scorecard_id,college_name,entry_year,coverage,source_url,verified_on)
SELECT 'd1000000-0000-4000-8000-000000000003',999950,'Workspace test college',graduation_year,'verified','https://example.edu/original',CURRENT_DATE
FROM students WHERE id='a0000000-0000-4000-8000-000000000041';
INSERT INTO college_library_prompts(id,prompt_set_id,prompt_key,title,prompt_text,word_limit,character_limit,requirement) VALUES
 ('d1000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000003','required','Required response','Describe a project.',250,NULL,'required'),
 ('d1000000-0000-4000-8000-000000000005','d1000000-0000-4000-8000-000000000003','optional','Optional response','What matters?',NULL,200,'optional'),
 ('d1000000-0000-4000-8000-000000000006','d1000000-0000-4000-8000-000000000003','conditional','Conditional response','Only for applicants to this program.',100,NULL,'conditional');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE a jsonb; b jsonb; sc uuid; n integer; BEGIN
 a:=public.create_student_application('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012',
 'a0000000-0000-4000-8000-000000000041','d1000000-0000-4000-8000-000000000001','rd','2027-01-01','explicit','[]');
 IF NOT (a->>'created')::boolean THEN RAISE EXCEPTION 'Application not created'; END IF;
 SELECT student_college_id INTO sc FROM applications WHERE id=(a->>'id')::uuid;
 b:=public.create_college_application('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012',sc,'ea','2026-11-01','estimate','[]');
 IF a->>'id' <> b->>'id' OR (b->>'created')::boolean THEN RAISE EXCEPTION 'Application is not idempotent'; END IF;
 IF NOT EXISTS (SELECT 1 FROM applications WHERE id=(a->>'id')::uuid AND application_type='rd' AND deadline_source='explicit') THEN RAISE EXCEPTION 'Retry changed chosen round/deadline'; END IF;
 IF (SELECT count(*) FROM essay_drafts WHERE student_college_id=sc) <> 1 THEN RAISE EXCEPTION 'Non-required response auto assigned'; END IF;
 IF NOT EXISTS (SELECT 1 FROM essay_drafts WHERE student_college_id=sc AND application_id=(a->>'id')::uuid AND word_count_limit=250
   AND library_prompt_snapshot->>'source_url'='https://example.edu/original') THEN RAISE EXCEPTION 'Source or application link missing'; END IF;
 n:=public.assign_college_prompts('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012',sc,'d1000000-0000-4000-8000-000000000005');
 IF n<>1 OR NOT EXISTS (SELECT 1 FROM essay_drafts WHERE student_college_id=sc AND character_count_limit=200 AND word_count_limit IS NULL AND application_id=(a->>'id')::uuid) THEN RAISE EXCEPTION 'Optional character-limited response failed'; END IF;
 PERFORM public.assign_college_prompts('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012',sc,'d1000000-0000-4000-8000-000000000006');
 UPDATE essay_drafts SET body='Preserved final writing',status='final',visibility_scope='family'
 WHERE library_prompt_id='d1000000-0000-4000-8000-000000000004';
 n:=public.assign_college_prompts('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012',sc);
 IF n<>0 OR NOT EXISTS (SELECT 1 FROM essay_drafts WHERE body='Preserved final writing' AND status='final' AND visibility_scope='family') THEN RAISE EXCEPTION 'Refreshing overwrote writing'; END IF;
 IF (SELECT count(*) FROM essay_draft_versions v JOIN essay_drafts e ON e.id=v.essay_draft_id WHERE e.student_college_id=sc)<>3 THEN RAISE EXCEPTION 'Versions duplicated or missing'; END IF;
END $$;
RESET ROLE;
UPDATE college_prompt_sets SET source_url='https://example.edu/new-season' WHERE id='d1000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
DO $$ DECLARE sc uuid; BEGIN
 SELECT id INTO sc FROM student_colleges WHERE college_id='d1000000-0000-4000-8000-000000000001';
 PERFORM public.assign_college_prompts('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012',sc);
 IF EXISTS (SELECT 1 FROM essay_drafts WHERE student_college_id=sc AND library_prompt_snapshot->>'source_url'<>'https://example.edu/original') THEN RAISE EXCEPTION 'Source snapshot overwritten'; END IF;
END $$;
-- Portal actors cannot assign responses or start applications, even through RPC.
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DO $$ DECLARE sc uuid; BEGIN
 SELECT id INTO sc FROM student_colleges WHERE college_id='d1000000-0000-4000-8000-000000000001';
 BEGIN
  PERFORM public.assign_college_prompts('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015',sc);
  RAISE EXCEPTION 'Student assigned prompts';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT IN ('Staff access required','College not found') THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.create_college_application('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015',sc,'rd',NULL,'estimate','[]');
  RAISE EXCEPTION 'Student created application';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT IN ('Staff access required','College not found') THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ DECLARE sc uuid; BEGIN
 SELECT id INTO sc FROM student_colleges WHERE college_id='d1000000-0000-4000-8000-000000000001';
 BEGIN
  PERFORM public.assign_college_prompts('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000013',sc);
  RAISE EXCEPTION 'Parent assigned prompts';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT IN ('Staff access required','College not found') THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.assign_college_prompts('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012',sc);
  RAISE EXCEPTION 'Parent impersonated staff';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT IN ('Not authorized','College not found') THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_beta_counselor"}',true);
DO $$ BEGIN
 BEGIN
  PERFORM public.create_student_application('b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000012',
    'a0000000-0000-4000-8000-000000000041','d1000000-0000-4000-8000-000000000002','rd',NULL,'estimate','[]');
  RAISE EXCEPTION 'Cross-firm application created';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Student not found' THEN RAISE; END IF; END;
END $$;
-- A failure after list insertion rolls back the list and all assignments too.
RESET ROLE;
CREATE FUNCTION public.reject_workspace_application() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test application failure'; END $$;
CREATE TRIGGER reject_workspace_application BEFORE INSERT ON applications FOR EACH ROW EXECUTE FUNCTION public.reject_workspace_application();
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.create_student_application('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012',
    'a0000000-0000-4000-8000-000000000041','d1000000-0000-4000-8000-000000000002','rd',NULL,'estimate','[]');
  RAISE EXCEPTION 'Failed creation survived';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Test application failure' THEN RAISE; END IF; END;
 IF EXISTS (SELECT 1 FROM student_colleges WHERE college_id='d1000000-0000-4000-8000-000000000002') THEN RAISE EXCEPTION 'Orphan list entry survived'; END IF;
END $$;
ROLLBACK;
