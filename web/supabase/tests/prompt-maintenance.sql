\set ON_ERROR_STOP on
BEGIN;
INSERT INTO colleges(id,name,slug,scorecard_id) VALUES ('d0000000-0000-4000-8000-000000000001','Review university','annual-review-test',999954);
INSERT INTO college_prompt_sets(id,scorecard_id,college_name,entry_year,coverage,source_url,verified_on)
VALUES ('d0000000-0000-4000-8000-000000000002',999954,'Review university',2027,'verified','https://example.edu/apply',CURRENT_DATE);
INSERT INTO college_library_prompts(id,prompt_set_id,prompt_key,title,prompt_text,word_limit,requirement)
VALUES ('d0000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000002','story','Original story','Tell your story.',250,'required');
UPDATE students SET graduation_year=2027 WHERE id='a0000000-0000-4000-8000-000000000041';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO student_colleges(id,firm_id,student_id,college_id,category,created_by_user_id,updated_by_user_id) VALUES
('d0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','d0000000-0000-4000-8000-000000000001','target','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012');
UPDATE essay_drafts SET body='Preserve my words',status='in_review' WHERE library_prompt_id='d0000000-0000-4000-8000-000000000003';
SELECT public.start_prompt_review('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','d0000000-0000-4000-8000-000000000002',2027);
DO $$ DECLARE s college_prompt_sets; BEGIN
 SELECT * INTO s FROM college_prompt_sets WHERE firm_id='a0000000-0000-4000-8000-000000000001' AND scorecard_id=999954;
 IF s.coverage<>'needs_review' OR s.verified_on IS NOT NULL OR s.published_at IS NOT NULL THEN RAISE EXCEPTION 'Copy inherited verification'; END IF;
 PERFORM public.save_prompt_review(s.firm_id,'a0000000-0000-4000-8000-000000000012',s.id,s.updated_at,jsonb_build_object(
  'coverage','verified','source_url','https://example.edu/current','verified_on',CURRENT_DATE,'review_due_on',CURRENT_DATE+200,'notes','Public guidance','review_notes','PRIVATE REVIEW EVIDENCE',
  'prompts',jsonb_build_array(jsonb_build_object('prompt_key','story','title','Revised story','prompt_text','Updated requirements','word_limit',300,'character_limit',null,'requirement','required','text_kind','summary'))));
 BEGIN
   PERFORM public.save_prompt_review(s.firm_id,'a0000000-0000-4000-8000-000000000012',s.id,s.updated_at,'{}');
   RAISE EXCEPTION 'Stale save permitted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'This review changed%' THEN RAISE; END IF; END;
 SELECT * INTO s FROM college_prompt_sets WHERE id=s.id;
 BEGIN
  PERFORM public.publish_prompt_review(s.firm_id,'a0000000-0000-4000-8000-000000000012',s.id,s.updated_at);
  RAISE EXCEPTION 'Counselor published';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Only owners and admins can publish' THEN RAISE; END IF; END;
END $$;
-- Other firms and both portal roles cannot see a private draft or its responses.
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_beta_counselor"}',true);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM college_prompt_sets WHERE firm_id='a0000000-0000-4000-8000-000000000001') OR
    EXISTS (SELECT 1 FROM college_library_prompts WHERE firm_id='a0000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Cross-firm review leak'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM college_prompt_sets WHERE firm_id IS NOT NULL AND scorecard_id=999954) OR EXISTS (SELECT 1 FROM college_library_prompts WHERE firm_id IS NOT NULL) THEN RAISE EXCEPTION 'Student saw draft'; END IF;
 BEGIN
 PERFORM public.start_prompt_review('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000014','d0000000-0000-4000-8000-000000000002',2028);
 RAISE EXCEPTION 'Student created review';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Not authorized' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF EXISTS (SELECT 1 FROM college_prompt_sets WHERE firm_id IS NOT NULL AND scorecard_id=999954) THEN RAISE EXCEPTION 'Parent saw draft'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_owner"}',true);
DO $$ DECLARE s college_prompt_sets; BEGIN
 SELECT * INTO s FROM college_prompt_sets WHERE firm_id='a0000000-0000-4000-8000-000000000001' AND scorecard_id=999954;
 PERFORM public.publish_prompt_review(s.firm_id,'a0000000-0000-4000-8000-000000000011',s.id,s.updated_at);
 BEGIN
  UPDATE college_prompt_sets SET notes='Tamper',updated_by_user_id='a0000000-0000-4000-8000-000000000011' WHERE id=s.id;
  RAISE EXCEPTION 'Published set changed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Published requirements are immutable; create a revision' THEN RAISE; END IF; END;
 BEGIN
  UPDATE college_library_prompts SET prompt_text='Tamper' WHERE prompt_set_id=s.id;
  IF FOUND THEN RAISE EXCEPTION 'Published response changed'; END IF;
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Only draft responses can be edited' THEN RAISE; END IF; END;
 PERFORM public.assign_college_prompts(s.firm_id,'a0000000-0000-4000-8000-000000000011','d0000000-0000-4000-8000-000000000004');
 IF (SELECT count(*) FROM essay_drafts WHERE library_prompt_slot='999954:2027:story')<>1 THEN RAISE EXCEPTION 'Duplicate assignment across revisions'; END IF;
 IF NOT EXISTS (SELECT 1 FROM essay_drafts WHERE library_prompt_slot='999954:2027:story' AND body='Preserve my words' AND status='in_review' AND word_count_limit=250 AND library_prompt_id='d0000000-0000-4000-8000-000000000003' AND library_prompt_snapshot->>'source_url'='https://example.edu/apply' AND visibility_scope='student' AND current_version_number=1) THEN RAISE EXCEPTION 'Existing writing or source changed'; END IF;
 PERFORM public.start_prompt_review(s.firm_id,'a0000000-0000-4000-8000-000000000011',s.id,2028);
 IF NOT EXISTS (SELECT 1 FROM college_prompt_sets WHERE firm_id=s.firm_id AND scorecard_id=999954 AND entry_year=2028 AND coverage='needs_review' AND verified_on IS NULL AND review_due_on IS NULL AND review_state='draft') THEN RAISE EXCEPTION 'Annual rollover copied verification'; END IF;
 -- Fresh revision is not publishable until its source has been reviewed.
 SELECT * INTO s FROM college_prompt_sets WHERE firm_id=s.firm_id AND scorecard_id=999954 AND entry_year=2028;
 BEGIN
  PERFORM public.publish_prompt_review(s.firm_id,'a0000000-0000-4000-8000-000000000011',s.id,s.updated_at);
  RAISE EXCEPTION 'Unchecked annual copy published';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Record a current source check%' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM college_prompt_review_evidence) THEN RAISE EXCEPTION 'Private review evidence leaked to student'; END IF;
 IF NOT EXISTS (SELECT 1 FROM college_prompt_sets WHERE firm_id='a0000000-0000-4000-8000-000000000001' AND scorecard_id=999954 AND entry_year=2027 AND review_state='published') THEN RAISE EXCEPTION 'Published requirement unavailable to student'; END IF;
 IF EXISTS (SELECT 1 FROM college_prompt_sets WHERE firm_id IS NOT NULL AND scorecard_id=999954 AND entry_year=2028) THEN RAISE EXCEPTION 'Annual draft leaked'; END IF;
END $$;
ROLLBACK;
