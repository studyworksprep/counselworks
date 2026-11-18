\set ON_ERROR_STOP on
BEGIN;
-- Exercise a firm calendar whose date can differ from the database's UTC day.
UPDATE firms SET timezone='Pacific/Auckland' WHERE id='a0000000-0000-4000-8000-000000000001';
CREATE FUNCTION pg_temp.must_fail(statement text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean:=false; BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN insufficient_privilege OR check_violation OR raise_exception OR foreign_key_violation THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Expected rejection: %',statement; END IF;
END $$;
CREATE FUNCTION pg_temp.packet(actor uuid,general uuid[] DEFAULT '{}') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v jsonb; result uuid; BEGIN
 v:=public.application_review_preview('a0000000-0000-4000-8000-000000000001',actor,'c6100000-0000-4000-8000-000000000003',general);
 INSERT INTO application_review_packets(firm_id,student_id,application_id,fingerprint,manifest,created_by_user_id,updated_by_user_id)
 VALUES('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','c6100000-0000-4000-8000-000000000003',v->>'fingerprint',v->'manifest',actor,actor) RETURNING id INTO result;
 RETURN result;
END $$;
CREATE FUNCTION pg_temp.act(actor uuid,action text,rev integer DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE p application_review_packets; BEGIN
 SELECT * INTO p FROM application_review_packets WHERE application_id='c6100000-0000-4000-8000-000000000003' ORDER BY number DESC LIMIT 1;
 RETURN public.update_application_packet('a0000000-0000-4000-8000-000000000001',actor,p.id,coalesce(rev,p.revision),action,
 CASE WHEN action='submit' THEN (now() AT TIME ZONE 'Pacific/Auckland')::date END,CASE WHEN action='submit' THEN 'Common App' END,CASE WHEN action='submit' THEN 'TEST-RECEIPT' END);
END $$;
INSERT INTO colleges(id,name,slug) VALUES('c6100000-0000-4000-8000-000000000001','Review College','final-review-sql-test');
INSERT INTO student_colleges(id,firm_id,student_id,college_id,category,created_by_user_id,updated_by_user_id) VALUES
 ('c6100000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','c6100000-0000-4000-8000-000000000001','target','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012');
INSERT INTO applications(id,firm_id,student_id,student_college_id,college_id,application_type,checklist_json,deadline_source,created_by_user_id,updated_by_user_id) VALUES
 ('c6100000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','c6100000-0000-4000-8000-000000000002','c6100000-0000-4000-8000-000000000001','rd','[{"key":"portal","label":"Portal requirements checked","done":true}]','explicit','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012');
INSERT INTO essay_drafts(id,firm_id,student_id,application_id,essay_type,title,prompt_text,body,word_count_limit,visibility_scope,created_by_user_id,updated_by_user_id) VALUES
 ('c6100000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','c6100000-0000-4000-8000-000000000003','supplemental','Reviewed writing','What matters to you?','A shared experience.',100,'family','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012');
INSERT INTO essay_draft_versions(essay_draft_id,version_number,body,commentary,created_by_user_id) VALUES
 ('c6100000-0000-4000-8000-000000000004',1,'A shared experience.','PRIVATE COMMENTARY','a0000000-0000-4000-8000-000000000012');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.packet('a0000000-0000-4000-8000-000000000012');
SELECT pg_temp.must_fail($q$SELECT pg_temp.act('a0000000-0000-4000-8000-000000000012','approve_student')$q$);
SELECT pg_temp.act('a0000000-0000-4000-8000-000000000012','approve_counselor');
SELECT pg_temp.must_fail($q$SELECT pg_temp.act('a0000000-0000-4000-8000-000000000012','share')$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
SELECT pg_temp.must_fail($q$SELECT pg_temp.act('a0000000-0000-4000-8000-000000000015','approve_counselor')$q$);
SELECT pg_temp.must_fail($q$UPDATE applications SET stage='submitted',submitted_at=now(),updated_by_user_id='a0000000-0000-4000-8000-000000000015' WHERE id='c6100000-0000-4000-8000-000000000003'$q$);
SELECT pg_temp.act('a0000000-0000-4000-8000-000000000015','approve_student');
SELECT pg_temp.must_fail($q$SELECT pg_temp.act('a0000000-0000-4000-8000-000000000015','share',1)$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM application_review_packets) THEN RAISE EXCEPTION 'Unshared packet leaked to parent'; END IF;END $$;
SELECT pg_temp.must_fail($q$SELECT public.application_review_preview('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000013','c6100000-0000-4000-8000-000000000003')$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
SELECT pg_temp.act('a0000000-0000-4000-8000-000000000015','share');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent2"}',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM application_review_packets)<>1 THEN RAISE EXCEPTION 'Shared packet missing for second parent'; END IF;
 IF EXISTS(SELECT 1 FROM application_review_packets WHERE manifest::text LIKE '%PRIVATE COMMENTARY%') THEN RAISE EXCEPTION 'Private version commentary copied to packet'; END IF;
 IF EXISTS(SELECT 1 FROM essay_draft_versions WHERE essay_draft_id='c6100000-0000-4000-8000-000000000004') THEN RAISE EXCEPTION 'Sharing opened draft history'; END IF;
END $$;
SELECT pg_temp.must_fail($q$SELECT pg_temp.act('a0000000-0000-4000-8000-000000000014','submit')$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_beta_owner"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM application_review_packets) THEN RAISE EXCEPTION 'Cross-firm read'; END IF; END $$;
SELECT pg_temp.must_fail($q$SELECT public.application_review_preview('a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000011','c6100000-0000-4000-8000-000000000003')$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
-- An autosave does not create a version but still invalidates the review.
SELECT public.write_essay('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c6100000-0000-4000-8000-000000000004','autosave','New unsaved writing.');
SELECT pg_temp.must_fail($q$SELECT pg_temp.act('a0000000-0000-4000-8000-000000000012','approve_counselor')$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM application_review_packets) THEN RAISE EXCEPTION 'Outdated writing still shared'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
SELECT pg_temp.must_fail($q$SELECT pg_temp.act('a0000000-0000-4000-8000-000000000015','submit')$q$);
DO $$ DECLARE v jsonb;BEGIN
 v:=public.application_review_preview('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c6100000-0000-4000-8000-000000000003');
 IF NOT (v->'blockers')::text LIKE '%save the current writing%' THEN RAISE EXCEPTION 'Unsaved response not blocked'; END IF;
END $$;
SELECT public.write_essay('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c6100000-0000-4000-8000-000000000004','save','New saved writing.');
SELECT pg_temp.packet('a0000000-0000-4000-8000-000000000015');
SELECT pg_temp.act('a0000000-0000-4000-8000-000000000015','approve_student');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SELECT pg_temp.act('a0000000-0000-4000-8000-000000000012','approve_counselor');
SELECT pg_temp.must_fail($q$UPDATE application_review_packets SET manifest=jsonb_set(manifest,'{college}','"Forged college"'),revision=revision+1,updated_by_user_id='a0000000-0000-4000-8000-000000000012' WHERE number=2$q$);
-- Checklist edits require another packet, and incomplete checks cannot be approved.
SAVEPOINT hidden_latest;
INSERT INTO essay_drafts(id,firm_id,student_id,essay_type,title,body,visibility_scope,created_by_user_id,updated_by_user_id) VALUES
 ('c6100000-0000-4000-8000-000000000007','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','personal_statement','Later general essay','Additional writing.','student','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012');
INSERT INTO essay_draft_versions(essay_draft_id,version_number,body,created_by_user_id) VALUES
 ('c6100000-0000-4000-8000-000000000007',1,'Additional writing.','a0000000-0000-4000-8000-000000000012');
SELECT pg_temp.packet('a0000000-0000-4000-8000-000000000012',ARRAY['c6100000-0000-4000-8000-000000000007'::uuid]);
UPDATE essay_drafts SET visibility_scope='staff' WHERE id='c6100000-0000-4000-8000-000000000007';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
-- Newest content is hidden, but an older matching packet must not revive.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM application_review_packets WHERE number=3) THEN RAISE EXCEPTION 'Withdrawn packet contents leaked'; END IF; END $$;
SELECT pg_temp.must_fail($q$SELECT pg_temp.act('a0000000-0000-4000-8000-000000000015','submit')$q$);
SELECT pg_temp.must_fail($q$SELECT pg_temp.packet('a0000000-0000-4000-8000-000000000015')$q$);
SELECT pg_temp.must_fail($q$UPDATE applications SET latest_review_packet_id=(SELECT id FROM application_review_packets WHERE application_id='c6100000-0000-4000-8000-000000000003' AND number=2),updated_by_user_id='a0000000-0000-4000-8000-000000000015' WHERE id='c6100000-0000-4000-8000-000000000003'$q$);
ROLLBACK TO SAVEPOINT hidden_latest;
UPDATE applications SET checklist_json='[{"key":"portal","label":"Portal checked","done":false}]' WHERE id='c6100000-0000-4000-8000-000000000003';
SELECT pg_temp.must_fail($q$SELECT pg_temp.act('a0000000-0000-4000-8000-000000000012','approve_counselor')$q$);
SELECT pg_temp.packet('a0000000-0000-4000-8000-000000000012');
SELECT pg_temp.must_fail($q$SELECT pg_temp.act('a0000000-0000-4000-8000-000000000012','approve_counselor')$q$);
UPDATE applications SET checklist_json='[{"key":"portal","label":"Portal checked","done":true}]' WHERE id='c6100000-0000-4000-8000-000000000003';
SELECT pg_temp.packet('a0000000-0000-4000-8000-000000000012');
SELECT pg_temp.act('a0000000-0000-4000-8000-000000000012','approve_counselor');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
SELECT pg_temp.act('a0000000-0000-4000-8000-000000000015','approve_student');
SELECT pg_temp.act('a0000000-0000-4000-8000-000000000015','submit');
SELECT pg_temp.must_fail($q$SELECT pg_temp.act('a0000000-0000-4000-8000-000000000015','withdraw_student')$q$);
SELECT pg_temp.must_fail($q$UPDATE applications SET application_type='ed',updated_by_user_id='a0000000-0000-4000-8000-000000000015' WHERE id='c6100000-0000-4000-8000-000000000003'$q$);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM applications WHERE id='c6100000-0000-4000-8000-000000000003' AND stage='submitted' AND (submitted_at AT TIME ZONE 'Pacific/Auckland')::date=(now() AT TIME ZONE 'Pacific/Auckland')::date) THEN RAISE EXCEPTION 'Handoff did not update tracker using the firm calendar'; END IF;
 IF NOT EXISTS(SELECT 1 FROM application_review_packets WHERE number=1 AND student_approved_at IS NOT NULL AND counselor_approved_at IS NOT NULL AND manifest->'essays'->0->>'body'='A shared experience.') THEN RAISE EXCEPTION 'Original approval evidence lost'; END IF;
END $$;
RESET ROLE;
-- Additional preflight checks: published requirements, real limits, open
-- revision work, general essay selection, and private material exclusion.
INSERT INTO essay_drafts(id,firm_id,student_id,application_id,essay_type,title,body,visibility_scope,created_by_user_id,updated_by_user_id) VALUES
 ('c6100000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041','c6100000-0000-4000-8000-000000000003','supplemental','PRIVATE ASSIGNMENT','PRIVATE BODY','staff','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012'),
 ('c6100000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000041',NULL,'personal_statement','General essay','A chosen general essay.','student','a0000000-0000-4000-8000-000000000012','a0000000-0000-4000-8000-000000000012');
INSERT INTO essay_draft_versions(essay_draft_id,version_number,body,created_by_user_id) VALUES
 ('c6100000-0000-4000-8000-000000000006',1,'A chosen general essay.','a0000000-0000-4000-8000-000000000012');
UPDATE colleges SET scorecard_id=9999961 WHERE id='c6100000-0000-4000-8000-000000000001';
INSERT INTO college_prompt_sets(id,scorecard_id,college_name,entry_year,coverage,source_url,verified_on)
 SELECT 'c6100000-0000-4000-8000-000000000010',9999961,'Review College',graduation_year,'verified','https://example.edu/requirements',CURRENT_DATE
 FROM students WHERE id='a0000000-0000-4000-8000-000000000041';
INSERT INTO college_library_prompts(id,prompt_set_id,prompt_key,title,prompt_text,word_limit,requirement) VALUES
 ('c6100000-0000-4000-8000-000000000011','c6100000-0000-4000-8000-000000000010','required','Required question','A current requirement',2,'required');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);SET LOCAL ROLE authenticated;
DO $$ DECLARE v jsonb; chosen jsonb; BEGIN
 v:=public.application_review_preview('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c6100000-0000-4000-8000-000000000003');
 IF v::text LIKE '%PRIVATE%' OR v::text LIKE '%A chosen general essay%' THEN RAISE EXCEPTION 'Private or unselected material entered preview'; END IF;
 IF (v->'blockers')::text NOT LIKE '%Required college responses are missing%' THEN RAISE EXCEPTION 'Missing current requirement not flagged'; END IF;
 chosen:=public.application_review_preview('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c6100000-0000-4000-8000-000000000003',ARRAY['c6100000-0000-4000-8000-000000000006'::uuid]);
 IF jsonb_array_length(chosen->'manifest'->'essays')<>2 OR chosen->>'fingerprint'=v->>'fingerprint' THEN RAISE EXCEPTION 'Selected general essay did not join review'; END IF;
END $$;
SELECT pg_temp.must_fail($q$SELECT public.application_review_preview('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000015','c6100000-0000-4000-8000-000000000003',ARRAY['c6100000-0000-4000-8000-000000000005'::uuid])$q$);
RESET ROLE;
UPDATE essay_drafts SET library_prompt_slot='9999961:'||(SELECT graduation_year FROM students WHERE id='a0000000-0000-4000-8000-000000000041')::text||':required',character_count_limit=3
 WHERE id='c6100000-0000-4000-8000-000000000004';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);SET LOCAL ROLE authenticated;
DO $$ DECLARE v jsonb; BEGIN
 v:=public.application_review_preview('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c6100000-0000-4000-8000-000000000003');
 IF (v->'warnings')::text NOT LIKE '%published requirements changed%' OR (v->'blockers')::text NOT LIKE '%current published limit%' OR (v->'blockers')::text NOT LIKE '%exceeds its limit%' THEN RAISE EXCEPTION 'Changed prompt or limits not flagged'; END IF;
 IF (v->'blockers')::text LIKE '%Required college responses are missing%' THEN RAISE EXCEPTION 'Canonical prompt identity was not matched'; END IF;
END $$;
INSERT INTO essay_feedback(id,firm_id,essay_draft_id,version_number,author_user_id,body) VALUES
 ('c6100000-0000-4000-8000-000000000020','a0000000-0000-4000-8000-000000000001','c6100000-0000-4000-8000-000000000004',2,'a0000000-0000-4000-8000-000000000012','PRIVATE COACHING INSTRUCTIONS');
SELECT public.create_essay_revision_task('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c6100000-0000-4000-8000-000000000020','Revise writing','PRIVATE REVISION INSTRUCTIONS',NULL);
DO $$ DECLARE v jsonb; BEGIN
 v:=public.application_review_preview('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000012','c6100000-0000-4000-8000-000000000003');
 IF (v->'blockers')::text NOT LIKE '%open essay revision tasks%' OR v::text LIKE '%PRIVATE%' THEN RAISE EXCEPTION 'Revision guard or private text boundary failed'; END IF;
END $$;
RESET ROLE;
-- Removing an assignment, read-only staff and unrelated families keep their boundaries.
DELETE FROM student_staff_assignments WHERE firm_id='a0000000-0000-4000-8000-000000000001' AND student_id='a0000000-0000-4000-8000-000000000041' AND user_id='a0000000-0000-4000-8000-000000000012';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);SET LOCAL ROLE authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM application_review_packets) THEN RAISE EXCEPTION 'Unassigned counselor read'; END IF; END $$;
RESET ROLE;
UPDATE firm_memberships SET role='read_only_staff' WHERE user_id='a0000000-0000-4000-8000-000000000011' AND firm_id='a0000000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_owner"}',true);SET LOCAL ROLE authenticated;
SELECT pg_temp.must_fail($q$SELECT pg_temp.act('a0000000-0000-4000-8000-000000000011','unshare')$q$);
ROLLBACK;
