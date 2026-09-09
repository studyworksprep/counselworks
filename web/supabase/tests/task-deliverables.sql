\set ON_ERROR_STOP on
-- Disposable fixtures only. All test rows and mutations are rolled back.
BEGIN;
CREATE TEMP TABLE work_test AS SELECT
  'a0000000-0000-4000-8000-000000000001'::uuid firm,
  'a0000000-0000-4000-8000-000000000012'::uuid counselor,
  'a0000000-0000-4000-8000-000000000015'::uuid student_user,
  'a0000000-0000-4000-8000-000000000041'::uuid student,
  gen_random_uuid() template,gen_random_uuid() root_template,gen_random_uuid() next_template,
  gen_random_uuid() workflow,gen_random_uuid() root_step,gen_random_uuid() next_step,
  gen_random_uuid() essay,NULL::uuid task,NULL::uuid next_task,NULL::uuid version;
GRANT ALL ON work_test TO authenticated;
CREATE FUNCTION pg_temp.assert(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'Assertion failed: %',msg; END IF; END $$;
INSERT INTO workflow_templates(id,firm_id,name,workflow_type) SELECT template,firm,'Review test','custom' FROM work_test;
INSERT INTO workflow_template_steps(id,workflow_template_id,name,step_order,step_type,visibility_scope,completion_mode)
 SELECT root_template,template,'Essay',0,'task','student','review_required' FROM work_test;
INSERT INTO workflow_template_steps(id,workflow_template_id,name,step_order,step_type,visibility_scope,depends_on_step_id)
 SELECT next_template,template,'Next action',1,'task','student',root_template FROM work_test;
INSERT INTO student_workflows(id,firm_id,student_id,workflow_template_id,created_by_user_id)
 SELECT workflow,firm,student,template,counselor FROM work_test;
INSERT INTO student_workflow_steps(id,student_workflow_id,template_step_id,status,assigned_user_id)
 SELECT root_step,workflow,root_template,'pending',student_user FROM work_test UNION ALL
 SELECT next_step,workflow,next_template,'blocked',student_user FROM work_test;
INSERT INTO essay_drafts(id,firm_id,student_id,essay_type,body,visibility_scope,created_by_user_id,updated_by_user_id)
 SELECT essay,firm,student,'personal_statement','Original draft','student',counselor,counselor FROM work_test;
CREATE FUNCTION pg_temp.fail_step() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF current_setting('work_test.fail_materialize',true)='yes' AND NEW.linked_task_id IS NOT NULL THEN RAISE EXCEPTION 'Injected link failure'; END IF;
IF current_setting('work_test.fail_step',true)='yes' AND NEW.status='completed' THEN RAISE EXCEPTION 'Injected step write failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER work_test_fail BEFORE UPDATE ON student_workflow_steps FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_step();
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor","role":"authenticated"}',true);
DO $$ DECLARE x work_test; tid uuid; baseline integer; denied boolean:=false; BEGIN
 SELECT * INTO x FROM work_test;
 SELECT count(*) INTO baseline FROM tasks WHERE firm_id=x.firm;
 PERFORM set_config('work_test.fail_materialize','yes',true);
 BEGIN PERFORM materialize_workflow_task(x.root_step,x.firm,x.counselor,x.student_user,'student',true); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,'task-link failure is surfaced');
 PERFORM pg_temp.assert((SELECT count(*)=baseline FROM tasks WHERE firm_id=x.firm),'task-link failure creates no orphan');
 PERFORM set_config('work_test.fail_materialize','no',true);
 tid:=materialize_workflow_task(x.root_step,x.firm,x.counselor,x.student_user,'student',true);
 UPDATE work_test SET task=tid;
 UPDATE tasks SET related_entity_type='essay',related_entity_id=x.essay,reviewer_user_id=x.counselor WHERE id=tid AND firm_id=x.firm;
 PERFORM pg_temp.assert(tid=materialize_workflow_task(x.root_step,x.firm,x.counselor,x.student_user,'student',true),'materialization is idempotent');
 PERFORM pg_temp.assert(materialize_workflow_task(x.next_step,x.firm,x.counselor,x.student_user,'student',true) IS NULL,'blocked step cannot materialize');
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student","role":"authenticated"}',true);
DO $$ DECLARE x work_test; denied boolean:=false; BEGIN
 SELECT * INTO x FROM work_test;
 BEGIN PERFORM transition_task(x.firm,x.student_user,x.task,'completed'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,'generic completion cannot bypass review');
 PERFORM write_essay(x.firm,x.student_user,x.essay,'submit');
 UPDATE work_test SET version=(SELECT submitted_version_id FROM tasks WHERE id=x.task AND firm_id=x.firm);
 PERFORM pg_temp.assert((SELECT status='submitted' FROM tasks WHERE id=x.task AND firm_id=x.firm),'submission reaches task');
 PERFORM pg_temp.assert((SELECT status='blocked' FROM student_workflow_steps WHERE id=x.next_step),'submission cannot activate dependency');
 PERFORM write_essay(x.firm,x.student_user,x.essay,'submit');
 PERFORM pg_temp.assert((SELECT count(*)=1 FROM essay_draft_versions WHERE essay_draft_id=x.essay),'repeated submission creates one snapshot');
 PERFORM write_essay(x.firm,x.student_user,x.essay,'save','Original draft');
 PERFORM pg_temp.assert((SELECT status='changes_requested' FROM tasks WHERE id=x.task AND firm_id=x.firm),'a new saved version invalidates the earlier submission even with identical text');
 PERFORM write_essay(x.firm,x.student_user,x.essay,'submit');
 UPDATE work_test SET version=(SELECT submitted_version_id FROM tasks WHERE id=x.task AND firm_id=x.firm);
 denied:=false;
 BEGIN PERFORM transition_task(x.firm,x.student_user,x.task,'approved',(SELECT version FROM work_test)); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,'student cannot review own submission');
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor","role":"authenticated"}',true);
DO $$ DECLARE x work_test; denied boolean:=false; BEGIN
 SELECT * INTO x FROM work_test;
 BEGIN PERFORM transition_task(x.firm,x.counselor,x.task,'changes_requested',x.version,''); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,'changes requested requires feedback');
 PERFORM transition_task(x.firm,x.counselor,x.task,'changes_requested',x.version,'Add a concrete example.');
 PERFORM pg_temp.assert((SELECT status='revision_requested' FROM essay_drafts WHERE id=x.essay AND firm_id=x.firm),'task review updates existing essay');
 denied:=false;
 BEGIN PERFORM transition_task(x.firm,x.counselor,x.task,'approved',x.version); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,'requested revision must be resubmitted');
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student","role":"authenticated"}',true);
DO $$ DECLARE x work_test; BEGIN
 SELECT * INTO x FROM work_test;
 PERFORM write_essay(x.firm,x.student_user,x.essay,'autosave','Revised draft');
 PERFORM write_essay(x.firm,x.student_user,x.essay,'submit');
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor","role":"authenticated"}',true);
DO $$ DECLARE x work_test; denied boolean:=false; vid uuid; tid uuid; BEGIN
 SELECT * INTO x FROM work_test;
 BEGIN PERFORM transition_task(x.firm,x.counselor,x.task,'approved',x.version); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,'stale version approval is rejected');
 SELECT submitted_version_id INTO vid FROM tasks WHERE id=x.task AND firm_id=x.firm;
 PERFORM set_config('work_test.fail_step','yes',true);
 denied:=false;
 BEGIN PERFORM write_essay(x.firm,x.counselor,x.essay,'approved',NULL,vid); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,'step write failure is surfaced');
 PERFORM pg_temp.assert((SELECT status='submitted' FROM tasks WHERE id=x.task AND firm_id=x.firm),'failed approval leaves task submitted');
 PERFORM pg_temp.assert((SELECT status='in_review' FROM essay_drafts WHERE id=x.essay AND firm_id=x.firm),'failed approval leaves essay in review');
 PERFORM set_config('work_test.fail_step','no',true);
 PERFORM write_essay(x.firm,x.counselor,x.essay,'approved',NULL,vid);
 PERFORM pg_temp.assert((SELECT status='completed' FROM tasks WHERE id=x.task AND firm_id=x.firm),'standalone essay approval completes linked task');
 PERFORM pg_temp.assert((SELECT status='completed' FROM student_workflow_steps WHERE id=x.root_step),'approval completes step atomically');
 PERFORM pg_temp.assert((SELECT status='pending' FROM student_workflow_steps WHERE id=x.next_step),'approval activates next step');
 PERFORM transition_task(x.firm,x.counselor,x.task,'approved',vid);
 tid:=materialize_workflow_task(x.next_step,x.firm,x.counselor,x.student_user,'student',true);
 PERFORM pg_temp.assert(tid=materialize_workflow_task(x.next_step,x.firm,x.counselor,x.student_user,'student',true),'activation retry keeps task identity');
 UPDATE work_test SET next_task=tid;
 PERFORM transition_task(x.firm,x.counselor,x.task,'reopen');
 PERFORM pg_temp.assert((SELECT dependency_blocked AND NOT needs_attention FROM tasks WHERE id=tid AND firm_id=x.firm),'untouched next task is reblocked');
 PERFORM pg_temp.assert((SELECT status<>'completed' AND completed_at IS NULL FROM student_workflows WHERE id=x.workflow AND firm_id=x.firm),'reopen repairs overall progress');
 -- The preserved next task becomes actionable again after the new approval.
 PERFORM write_essay(x.firm,x.counselor,x.essay,'submit');
 SELECT submitted_version_id INTO vid FROM essay_drafts WHERE id=x.essay AND firm_id=x.firm;
 PERFORM write_essay(x.firm,x.counselor,x.essay,'approved',NULL,vid);
 PERFORM transition_task(x.firm,x.counselor,tid,'in_progress');
 PERFORM transition_task(x.firm,x.counselor,x.task,'reopen');
 PERFORM pg_temp.assert((SELECT dependency_blocked AND needs_attention AND status='in_progress' FROM tasks WHERE id=tid AND firm_id=x.firm),'started downstream work is preserved and flagged');
 PERFORM write_essay(x.firm,x.counselor,x.essay,'submit');
 SELECT submitted_version_id INTO vid FROM essay_drafts WHERE id=x.essay AND firm_id=x.firm;
 PERFORM write_essay(x.firm,x.counselor,x.essay,'approved',NULL,vid);
 PERFORM transition_task(x.firm,x.counselor,tid,'reopen');
 PERFORM transition_task(x.firm,x.counselor,tid,'completed');
 PERFORM pg_temp.assert((SELECT status='completed' FROM student_workflows WHERE id=x.workflow AND firm_id=x.firm),'all accepted steps complete workflow');
 PERFORM transition_task(x.firm,x.counselor,x.task,'reopen');
 PERFORM pg_temp.assert((SELECT dependency_blocked AND needs_attention AND status='changes_requested' AND completed_at IS NULL FROM tasks WHERE id=tid AND firm_id=x.firm),'invalid downstream completion is cleared without deleting the task');

END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent2","role":"authenticated"}',true);
DO $$ DECLARE x work_test; denied boolean:=false; BEGIN
 SELECT * INTO x FROM work_test;
 BEGIN PERFORM transition_task(x.firm,'a0000000-0000-4000-8000-000000000014',x.task,'submit'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,'parent cannot submit student work');
 denied:=false;
 BEGIN PERFORM write_essay(x.firm,x.counselor,x.essay,'approved',NULL,x.version); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,'forged actor cannot review');
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_beta_counselor","role":"authenticated"}',true);
DO $$ DECLARE x work_test; denied boolean:=false; BEGIN
 SELECT * INTO x FROM work_test;
 BEGIN PERFORM transition_task(x.firm,'b0000000-0000-4000-8000-000000000012',x.task,'approved',x.version); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,'cross-firm review is denied');
END $$;

SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor","role":"authenticated"}',true);
RESET ROLE;
ALTER TABLE work_test ADD COLUMN doc_task uuid, ADD COLUMN request uuid, ADD COLUMN document uuid, ADD COLUMN revision uuid;
SET LOCAL ROLE authenticated;
DO $$ DECLARE x work_test; dr uuid; doc uuid; tid uuid; rev uuid; BEGIN
 SELECT * INTO x FROM work_test;
 INSERT INTO document_requests(firm_id,student_id,title,requested_by_user_id)
  VALUES(x.firm,x.student,'Transcript',x.counselor) RETURNING id INTO dr;
 INSERT INTO documents(firm_id,student_id,title,category,storage_key,mime_type,visibility_scope,uploaded_by_user_id)
  VALUES(x.firm,x.student,'Private unrelated file','other','disposable/private','application/pdf','staff',x.counselor) RETURNING id INTO doc;
 INSERT INTO tasks(firm_id,student_id,title,task_type,visibility_scope,assigned_user_id,created_by_user_id,updated_by_user_id,
  completion_mode,reviewer_user_id,related_entity_type,related_entity_id)
  VALUES(x.firm,x.student,'Transcript','document_request','student',x.student_user,x.counselor,x.counselor,'review_required',x.counselor,'document_request',dr) RETURNING id INTO tid;
 UPDATE document_requests SET status='fulfilled',fulfilled_document_id=doc WHERE id=dr AND firm_id=x.firm;
 INSERT INTO documents(firm_id,student_id,title,category,storage_key,mime_type,visibility_scope,uploaded_by_user_id)
  VALUES(x.firm,x.student,'Revised transcript','other','disposable/revised','application/pdf','student',x.counselor) RETURNING id INTO rev;
 UPDATE work_test SET doc_task=tid,request=dr,document=doc,revision=rev;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student","role":"authenticated"}',true);
DO $$ DECLARE x work_test; denied boolean:=false; BEGIN
 SELECT * INTO x FROM work_test;
 BEGIN PERFORM transition_task(x.firm,x.student_user,x.doc_task,'submit'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,'inaccessible document cannot be submitted as evidence');
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor","role":"authenticated"}',true);
UPDATE documents SET visibility_scope='student' WHERE id=(SELECT document FROM work_test) AND firm_id=(SELECT firm FROM work_test);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student","role":"authenticated"}',true);
DO $$ DECLARE x work_test; BEGIN
 SELECT * INTO x FROM work_test;
 PERFORM transition_task(x.firm,x.student_user,x.doc_task,'submit');
 PERFORM transition_task(x.firm,x.student_user,x.doc_task,'submit');
 PERFORM pg_temp.assert((SELECT status='submitted' AND submitted_document_id=x.document FROM tasks WHERE id=x.doc_task AND firm_id=x.firm),'request upload is evidence, not approval');
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor","role":"authenticated"}',true);
DO $$ DECLARE x work_test; BEGIN
 SELECT * INTO x FROM work_test;
 PERFORM transition_task(x.firm,x.counselor,x.doc_task,'changes_requested',x.document,'Please upload the complete transcript.');
 PERFORM pg_temp.assert((SELECT status='requested' AND fulfilled_document_id=x.document FROM document_requests WHERE id=x.request AND firm_id=x.firm),'changes reopen request and preserve original evidence');
 UPDATE document_requests SET status='fulfilled',fulfilled_document_id=x.revision WHERE id=x.request AND firm_id=x.firm;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student","role":"authenticated"}',true);
DO $$ DECLARE x work_test; BEGIN
 SELECT * INTO x FROM work_test;
 PERFORM transition_task(x.firm,x.student_user,x.doc_task,'submit');
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor","role":"authenticated"}',true);
DO $$ DECLARE x work_test; denied boolean:=false; BEGIN
 SELECT * INTO x FROM work_test;
 BEGIN PERFORM transition_task(x.firm,x.counselor,x.doc_task,'approved',x.document); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,'stale document approval cannot accept replacement');
 PERFORM transition_task(x.firm,x.counselor,x.doc_task,'approved',x.revision);
 PERFORM transition_task(x.firm,x.counselor,x.doc_task,'approved',x.revision);
 PERFORM pg_temp.assert((SELECT status='completed' FROM tasks WHERE id=x.doc_task AND firm_id=x.firm),'document accepted exactly once');
END $$;

DO $$ DECLARE x work_test; baseline integer; denied boolean:=false; created jsonb; BEGIN
 SELECT * INTO x FROM work_test;
 SELECT count(*) INTO baseline FROM student_workflows WHERE firm_id=x.firm;
 BEGIN PERFORM create_workflow_instance(x.firm,x.counselor,x.student,x.template,jsonb_build_object('name','Atomic instance','repeat_key',gen_random_uuid()),
   jsonb_build_array(jsonb_build_object('template_step_id',x.root_template),jsonb_build_object('template_step_id',gen_random_uuid())));
 EXCEPTION WHEN OTHERS THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,'invalid instance step is rejected');
 PERFORM pg_temp.assert((SELECT count(*)=baseline FROM student_workflows WHERE firm_id=x.firm),'failed instance creates no partial workflow');
 created:=create_workflow_instance(x.firm,x.counselor,x.student,x.template,jsonb_build_object('name','Atomic instance','repeat_key',gen_random_uuid()),
   jsonb_build_array(jsonb_build_object('template_step_id',x.root_template,'assigned_user_id',x.student_user),
                    jsonb_build_object('template_step_id',x.next_template,'assigned_user_id',x.student_user)));
 PERFORM pg_temp.assert(jsonb_array_length(created->'student_workflow_steps')=2,'instance and steps are returned together');
 -- A specifically assigned parent can submit family-scoped evidence.
 INSERT INTO tasks(firm_id,student_id,title,task_type,visibility_scope,assigned_user_id,created_by_user_id,updated_by_user_id,
  completion_mode,related_entity_type,related_entity_id)
 VALUES(x.firm,x.student,'Parent evidence','document_request','family','a0000000-0000-4000-8000-000000000013',
  x.counselor,x.counselor,'evidence','document_request',x.request) RETURNING id INTO x.doc_task;
 UPDATE work_test SET doc_task=x.doc_task;
 UPDATE documents SET visibility_scope='family' WHERE firm_id=x.firm AND id=x.revision;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent2","role":"authenticated"}',true);
DO $$ DECLARE x work_test; denied boolean:=false; BEGIN
 SELECT * INTO x FROM work_test;
 BEGIN PERFORM transition_task(x.firm,'a0000000-0000-4000-8000-000000000014',x.doc_task,'submit'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,'other parent cannot submit evidence for the selected parent');
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1","role":"authenticated"}',true);
DO $$ DECLARE x work_test; BEGIN
 SELECT * INTO x FROM work_test;
 PERFORM transition_task(x.firm,'a0000000-0000-4000-8000-000000000013',x.doc_task,'submit');
 PERFORM pg_temp.assert((SELECT status='completed' AND submitted_document_id=x.revision FROM tasks WHERE id=x.doc_task AND firm_id=x.firm),'selected parent can complete evidence task');
END $$;
ROLLBACK;
\echo 'Task deliverable review regression suite passed.'
