\set ON_ERROR_STOP on
BEGIN;
INSERT INTO colleges(id,name,slug,scorecard_id) VALUES ('c0000000-0000-4000-8000-000000000047','Library test college','library-test-college',999947);
INSERT INTO colleges(id,name,slug,scorecard_id) VALUES ('c0000000-0000-4000-8000-000000000057','Other college','library-other-college',999948);
INSERT INTO college_prompt_sets(id,scorecard_id,college_name,entry_year,coverage,source_url,verified_on)
SELECT 'c0000000-0000-4000-8000-000000000048',999947,'Library test college',graduation_year,'verified','https://example.edu/prompts',CURRENT_DATE
FROM students WHERE id='a0000000-0000-4000-8000-000000000041';
INSERT INTO college_library_prompts(id,prompt_set_id,prompt_key,title,prompt_text,word_limit,requirement) VALUES
('c0000000-0000-4000-8000-000000000049','c0000000-0000-4000-8000-000000000048','required','Required test','Tell us about a project.',250,'required'),
('c0000000-0000-4000-8000-000000000050','c0000000-0000-4000-8000-000000000048','optional','Optional test','Optional response.',100,'optional'),
('c0000000-0000-4000-8000-000000000051','c0000000-0000-4000-8000-000000000048','conditional','Program test','Only for a specific program.',100,'conditional');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO student_colleges(id,firm_id,student_id,college_id,category,created_by_user_id,updated_by_user_id) VALUES
('c0000000-0000-4000-8000-000000000052','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','c0000000-0000-4000-8000-000000000047','target','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012');
DO $$ BEGIN
 IF (SELECT count(*) FROM essay_drafts WHERE library_prompt_id IS NOT NULL) <> 1 THEN RAISE EXCEPTION 'Expected one required assignment'; END IF;
 IF NOT EXISTS (SELECT 1 FROM essay_drafts e JOIN essay_draft_versions v ON v.essay_draft_id=e.id WHERE e.library_prompt_id IS NOT NULL AND e.visibility_scope='student' AND e.word_count_target=250 AND v.version_number=1) THEN RAISE EXCEPTION 'Missing shared draft/version'; END IF;
 BEGIN
   UPDATE college_prompt_sets SET notes='Tenant tampering';
   IF FOUND THEN RAISE EXCEPTION 'Catalog mutation permitted'; END IF;
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
UPDATE essay_drafts SET body='Keep my work', status='in_review' WHERE library_prompt_id IS NOT NULL;
DELETE FROM student_colleges WHERE id='c0000000-0000-4000-8000-000000000052';
INSERT INTO student_colleges(id,firm_id,student_id,college_id,category,created_by_user_id,updated_by_user_id) VALUES
('c0000000-0000-4000-8000-000000000053','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','c0000000-0000-4000-8000-000000000047','target','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012');
DO $$ BEGIN
 IF (SELECT count(*) FROM essay_drafts WHERE library_prompt_id IS NOT NULL) <> 1 THEN RAISE EXCEPTION 'Duplicate assignment'; END IF;
 IF NOT EXISTS (SELECT 1 FROM essay_drafts WHERE library_prompt_id IS NOT NULL AND body='Keep my work' AND status='in_review' AND student_college_id='c0000000-0000-4000-8000-000000000053') THEN RAISE EXCEPTION 'Work lost on re-add'; END IF;
END $$;
INSERT INTO applications(id,firm_id,student_id,college_id,student_college_id,application_type,created_by_user_id,updated_by_user_id) VALUES
('c0000000-0000-4000-8000-000000000054','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','c0000000-0000-4000-8000-000000000047','c0000000-0000-4000-8000-000000000053','rd','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012');
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM essay_drafts WHERE library_prompt_id IS NOT NULL AND application_id='c0000000-0000-4000-8000-000000000054') THEN RAISE EXCEPTION 'Application not linked'; END IF;
END $$;
-- Firm B cannot see or mutate the assigned drafts.
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_beta_counselor"}',true);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM essay_drafts WHERE library_prompt_id IS NOT NULL) THEN RAISE EXCEPTION 'Cross-firm leak'; END IF;
 BEGIN
   INSERT INTO student_colleges(firm_id,student_id,college_id,category,created_by_user_id,updated_by_user_id) VALUES
   ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','c0000000-0000-4000-8000-000000000057','target','b0000000-0000-4000-8000-000000000012','b0000000-0000-4000-8000-000000000012');
   RAISE EXCEPTION 'Cross-firm assignment permitted';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM <> 'Student not found' THEN RAISE; END IF;
 END;
END $$;
RESET ROLE;
-- Missing/wrong year and unverified coverage never generate drafts.
UPDATE college_prompt_sets SET entry_year=entry_year+1 WHERE scorecard_id=999947;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_beta_counselor"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO student_colleges(id,firm_id,student_id,college_id,category,created_by_user_id,updated_by_user_id) VALUES
('c0000000-0000-4000-8000-000000000055','b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000041','c0000000-0000-4000-8000-000000000047','target','b0000000-0000-4000-8000-000000000012','b0000000-0000-4000-8000-000000000012');
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM essay_drafts WHERE library_prompt_id IS NOT NULL) THEN RAISE EXCEPTION 'Wrong year assigned'; END IF;
END $$;
RESET ROLE;
UPDATE college_prompt_sets SET entry_year=(SELECT graduation_year FROM students WHERE id='b0000000-0000-4000-8000-000000000041'), coverage='needs_review' WHERE scorecard_id=999947;
SET LOCAL ROLE authenticated;
DELETE FROM student_colleges WHERE id='c0000000-0000-4000-8000-000000000055';
INSERT INTO student_colleges(firm_id,student_id,college_id,category,created_by_user_id,updated_by_user_id) VALUES
('b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000041','c0000000-0000-4000-8000-000000000047','target','b0000000-0000-4000-8000-000000000012','b0000000-0000-4000-8000-000000000012');
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM essay_drafts WHERE library_prompt_id IS NOT NULL) THEN RAISE EXCEPTION 'Unverified prompt assigned'; END IF;
END $$;
-- A failed version write must roll back the college and draft as one unit.
RESET ROLE;
DELETE FROM student_colleges WHERE firm_id='b0000000-0000-4000-8000-000000000001' AND college_id='c0000000-0000-4000-8000-000000000047';
UPDATE college_prompt_sets SET coverage='verified' WHERE scorecard_id=999947;
CREATE FUNCTION public.test_reject_library_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Simulated version failure'; END $$;
CREATE TRIGGER reject_library_version BEFORE INSERT ON essay_draft_versions
FOR EACH ROW EXECUTE FUNCTION public.test_reject_library_version();
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
   INSERT INTO student_colleges(firm_id,student_id,college_id,category,created_by_user_id,updated_by_user_id) VALUES
   ('b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000041','c0000000-0000-4000-8000-000000000047','target','b0000000-0000-4000-8000-000000000012','b0000000-0000-4000-8000-000000000012');
   RAISE EXCEPTION 'Failure was not atomic';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM <> 'Simulated version failure' THEN RAISE; END IF;
 END;
 IF EXISTS (SELECT 1 FROM student_colleges WHERE college_id='c0000000-0000-4000-8000-000000000047') OR
    EXISTS (SELECT 1 FROM essay_drafts WHERE library_prompt_id IS NOT NULL) THEN RAISE EXCEPTION 'Partial assignment survived'; END IF;
END $$;
-- Portal read filters retain the intended audience. Neither portal may write the catalog.
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM essay_drafts WHERE library_prompt_id IS NOT NULL AND visibility_scope IN ('student','family','firm') AND student_id='a0000000-0000-4000-8000-000000000041') THEN RAISE EXCEPTION 'Student assignment missing'; END IF;
 BEGIN
  DELETE FROM college_library_prompts;
  IF FOUND THEN RAISE EXCEPTION 'Student changed library'; END IF;
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM essay_drafts WHERE library_prompt_id IS NOT NULL AND visibility_scope IN ('family','firm')) THEN RAISE EXCEPTION 'Parent audience changed'; END IF;
 BEGIN
  UPDATE college_prompt_sets SET coverage='verified';
  IF FOUND THEN RAISE EXCEPTION 'Parent changed library'; END IF;
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;

-- Requested fall-2027 collection: exercise real choice slots and conditional routes.
BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM college_prompt_sets WHERE entry_year=2027 AND scorecard_id=ANY(ARRAY[166027,130794,131496,164924,228246,186131,211440,190150,199847,152080,216597,131159,231624,151351,122931,134130,135726,218663,228778,234076,234207])) <> 21 THEN
   RAISE EXCEPTION 'Requested college coverage missing';
 END IF;
 IF (SELECT count(*) FROM college_library_prompts p JOIN college_prompt_sets s ON s.id=p.prompt_set_id WHERE s.firm_id IS NULL AND s.entry_year=2027 AND s.scorecard_id=ANY(ARRAY[166027,130794,131496,164924,228246,186131,211440,190150,199847,152080,216597,131159,231624,151351,122931,134130,135726,218663,228778,234076,234207]))<>57 THEN RAISE EXCEPTION 'Expected 57 requested prompt summaries'; END IF;
 IF NOT EXISTS (SELECT 1 FROM college_library_prompts p JOIN college_prompt_sets s ON s.id=p.prompt_set_id WHERE s.scorecard_id=234076 AND s.entry_year=2027 AND s.coverage='verified' AND p.requirement='conditional' AND p.word_limit=300) THEN RAISE EXCEPTION 'UVA Nursing condition or limit missing'; END IF;
 IF (SELECT count(*) FROM college_prompt_sets WHERE firm_id IS NULL AND scorecard_id IN (228246,211440,231624,134130,234076) AND entry_year=2027 AND coverage='verified')<>5 THEN RAISE EXCEPTION 'Live application verifications missing'; END IF;
 IF (SELECT count(*) FROM college_library_prompts p JOIN college_prompt_sets s ON s.id=p.prompt_set_id WHERE s.firm_id IS NULL AND s.scorecard_id=228246 AND s.entry_year=2027 AND p.requirement='optional' AND p.word_limit=250)<>2 THEN RAISE EXCEPTION 'SMU optional responses incorrect'; END IF;
 IF (SELECT count(*) FROM college_library_prompts p JOIN college_prompt_sets s ON s.id=p.prompt_set_id WHERE s.firm_id IS NULL AND s.scorecard_id=231624 AND s.entry_year=2027 AND p.requirement='optional' AND p.word_limit=300)<>2 THEN RAISE EXCEPTION 'W&M choice slots incorrect'; END IF;
 IF (SELECT count(*) FROM college_library_prompts p JOIN college_prompt_sets s ON s.id=p.prompt_set_id WHERE s.firm_id IS NULL AND s.scorecard_id=134130 AND s.entry_year=2027 AND p.requirement='required')<>1 OR (SELECT count(*) FROM college_library_prompts p JOIN college_prompt_sets s ON s.id=p.prompt_set_id WHERE s.firm_id IS NULL AND s.scorecard_id=134130 AND s.entry_year=2027 AND p.requirement='conditional')<>5 THEN RAISE EXCEPTION 'UF universal and conditional coverage incorrect'; END IF;
 IF NOT EXISTS (SELECT 1 FROM college_prompt_sets WHERE scorecard_id=135726 AND entry_year=2027 AND coverage='no_supplement') THEN RAISE EXCEPTION 'Miami absence must be explicit'; END IF;
 IF EXISTS (SELECT 1 FROM college_library_prompts p JOIN college_prompt_sets s ON s.id=p.prompt_set_id WHERE s.scorecard_id IN (164924,152080,151351,234207) AND s.entry_year=2027 AND p.requirement='required') THEN RAISE EXCEPTION 'Conditional or optional prompts became universal'; END IF;
 IF (SELECT count(*) FROM college_prompt_sets WHERE scorecard_id=218663 AND entry_year=2027 AND coverage='needs_review') <> 1 THEN RAISE EXCEPTION 'Unverified requirements must not auto-assign'; END IF;
END $$;
INSERT INTO colleges(name,slug,scorecard_id)
SELECT college_name,'library-2027-test-' || scorecard_id,scorecard_id FROM college_prompt_sets s
WHERE entry_year=2027 AND scorecard_id IN (186131,190150,199847,164924,152080,151351,234207,135726,211440,134130,228246,231624)
AND NOT EXISTS (SELECT 1 FROM colleges c WHERE c.scorecard_id=s.scorecard_id);
UPDATE students SET graduation_year=2027 WHERE id='a0000000-0000-4000-8000-000000000041';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO student_colleges(firm_id,student_id,college_id,category,created_by_user_id,updated_by_user_id)
SELECT 'a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041',id,'target','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012'
FROM colleges WHERE scorecard_id IN (186131,190150,199847,164924,152080,151351,234207,135726,211440,134130,228246,231624);
DO $$ BEGIN
 IF (SELECT count(*) FROM essay_drafts WHERE library_prompt_id IS NOT NULL) <> 17 THEN RAISE EXCEPTION 'Expected 6 Princeton, 6 Columbia, 1 Wake, 3 CMU and 1 UF response'; END IF;
 IF EXISTS (SELECT 1 FROM essay_drafts e JOIN college_library_prompts p ON p.id=e.library_prompt_id JOIN college_prompt_sets s ON s.id=p.prompt_set_id WHERE s.scorecard_id NOT IN (186131,190150,199847,211440,134130)) THEN RAISE EXCEPTION 'Optional, conditional or unverified drafts assigned'; END IF;
 IF (SELECT count(*) FROM essay_draft_versions v JOIN essay_drafts e ON e.id=v.essay_draft_id WHERE e.library_prompt_id IS NOT NULL AND v.version_number=1) <> 17 THEN RAISE EXCEPTION 'Missing initial draft versions'; END IF;
END $$;

DO $$ DECLARE target record; BEGIN
 FOR target IN
  SELECT sc.id AS list_id,p.id AS prompt_id FROM student_colleges sc JOIN colleges c ON c.id=sc.college_id
  JOIN college_prompt_sets s ON s.scorecard_id=c.scorecard_id AND s.entry_year=2027 AND s.firm_id IS NULL
  JOIN college_library_prompts p ON p.prompt_set_id=s.id
  WHERE sc.firm_id='a0000000-0000-4000-8000-000000000001' AND sc.student_id='a0000000-0000-4000-8000-000000000041'
  AND ((c.scorecard_id=134130 AND p.prompt_key='honors') OR (c.scorecard_id=231624 AND p.prompt_key='optional-response-2') OR (c.scorecard_id=228246 AND p.prompt_key='why-smu'))
 LOOP
  IF public.assign_college_prompts('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012',target.list_id,target.prompt_id)<>1 THEN RAISE EXCEPTION 'Explicit verified program/optional assignment missing'; END IF;
  IF public.assign_college_prompts('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012',target.list_id,target.prompt_id)<>0 THEN RAISE EXCEPTION 'Explicit assignment duplicated'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM essay_drafts WHERE library_prompt_id IS NOT NULL)<>20 THEN RAISE EXCEPTION 'Expected 17 required plus 3 reviewed assignments'; END IF;
 IF NOT EXISTS (SELECT 1 FROM essay_drafts e JOIN college_library_prompts p ON p.id=e.library_prompt_id JOIN college_prompt_sets s ON s.id=p.prompt_set_id WHERE s.scorecard_id=134130 AND p.prompt_key='honors' AND e.word_count_limit=400 AND e.visibility_scope='student' AND e.library_prompt_snapshot->>'requirement'='conditional') THEN RAISE EXCEPTION 'UF Honors source/limit/audience incorrect'; END IF;
END $$;
ROLLBACK;
