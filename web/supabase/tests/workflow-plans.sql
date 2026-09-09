\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'Assertion failed: %',msg; END IF; END $$;
CREATE TEMP TABLE plan_test AS SELECT
 'a0000000-0000-4000-8000-000000000001'::uuid firm,'a0000000-0000-4000-8000-000000000012'::uuid actor,
 'a0000000-0000-4000-8000-000000000015'::uuid owner,'a0000000-0000-4000-8000-000000000041'::uuid student,
 gen_random_uuid() template,gen_random_uuid() ts1,gen_random_uuid() ts2,gen_random_uuid() ts3,
 gen_random_uuid() c1,gen_random_uuid() c2,gen_random_uuid() sc1,gen_random_uuid() sc2,gen_random_uuid() a1,gen_random_uuid() a2,
 NULL::uuid w1,NULL::uuid w2,NULL::uuid s1,NULL::uuid s2,NULL::uuid s3,NULL::uuid task1,NULL::jsonb proposal;
GRANT ALL ON plan_test TO authenticated;
INSERT INTO colleges(id,name,slug) SELECT c1,'Disposable One',c1::text FROM plan_test UNION ALL SELECT c2,'Disposable Two',c2::text FROM plan_test;
INSERT INTO student_colleges(id,firm_id,student_id,college_id,category,created_by_user_id,updated_by_user_id)
 SELECT sc1,firm,student,c1,'target',actor,actor FROM plan_test UNION ALL SELECT sc2,firm,student,c2,'target',actor,actor FROM plan_test;
INSERT INTO applications(id,firm_id,student_id,college_id,student_college_id,application_type,deadline_at,deadline_source,created_by_user_id,updated_by_user_id)
 SELECT a1,firm,student,c1,sc1,'ea','2026-11-01'::timestamptz,'explicit',actor,actor FROM plan_test UNION ALL
 SELECT a2,firm,student,c2,sc2,'rd','2027-01-01'::timestamptz,'explicit',actor,actor FROM plan_test;
INSERT INTO workflow_templates(id,firm_id,name,workflow_type,instantiation_scope) SELECT template,firm,'Disposable college plan','custom','student_college' FROM plan_test;
INSERT INTO workflow_template_steps(id,workflow_template_id,name,step_order,step_type,visibility_scope,default_assignee_role)
 SELECT ts1,template,'Draft',0,'task','family','student' FROM plan_test UNION ALL
 SELECT ts2,template,'Manual date',1,'task','family','student' FROM plan_test UNION ALL
 SELECT ts3,template,'Completed date',2,'task','family','student' FROM plan_test;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor","role":"authenticated"}',true);
DO $$ DECLARE x plan_test; steps jsonb; result jsonb; again jsonb; repeat_id uuid:=gen_random_uuid(); i integer; app uuid; college uuid; due date; zone text;
BEGIN
 SELECT * INTO x FROM plan_test;
 SELECT timezone INTO zone FROM firms WHERE id=x.firm;
 FOR i IN 1..2 LOOP
  app:=CASE WHEN i=1 THEN x.a1 ELSE x.a2 END;college:=CASE WHEN i=1 THEN x.sc1 ELSE x.sc2 END;due:=CASE WHEN i=1 THEN '2026-10-22'::date ELSE '2026-12-22'::date END;
  SELECT jsonb_agg(jsonb_build_object('template_step_id',t.id,'assigned_user_id',x.owner,'due_date',due,
   'snapshot_json',jsonb_build_object('title',t.name,'description','Saved instructions','priority','high','visibility',t.visibility_scope,
    'owner',x.owner,'ownerRole','student','ownerReady',true,'completionMode','simple','taskType','workflow_step','dependency',NULL,
    'dueSource',CASE WHEN t.id=x.ts2 THEN 'manual' ELSE 'application' END,'applicationId',app,'deadlineOffset',-10,'estimate',false,'timezone',zone)))
    INTO steps FROM workflow_template_steps t WHERE workflow_template_id=x.template;
  result:=create_workflow_instance(x.firm,x.actor,x.student,x.template,jsonb_build_object('name','Scoped plan','student_college_id',college),steps);
  again:=create_workflow_instance(x.firm,x.actor,x.student,x.template,jsonb_build_object('name','Accidental repeat','student_college_id',college),steps);
  PERFORM pg_temp.assert(result->>'id'=again->>'id','duplicate assignment returns same instance');
  IF i=1 THEN UPDATE plan_test SET w1=(result->>'id')::uuid; ELSE UPDATE plan_test SET w2=(result->>'id')::uuid; END IF;
 END LOOP;
 SELECT * INTO x FROM plan_test;
 PERFORM pg_temp.assert(x.w1<>x.w2,'two colleges get separate instances');
 UPDATE plan_test SET s1=(SELECT id FROM student_workflow_steps WHERE student_workflow_id=x.w1 AND template_step_id=x.ts1),
   s2=(SELECT id FROM student_workflow_steps WHERE student_workflow_id=x.w1 AND template_step_id=x.ts2),
   s3=(SELECT id FROM student_workflow_steps WHERE student_workflow_id=x.w1 AND template_step_id=x.ts3);
 SELECT * INTO x FROM plan_test;
 UPDATE plan_test SET task1=materialize_workflow_task(x.s1,x.firm,x.actor,x.owner,'student',true);
 UPDATE student_workflow_steps SET status='completed' WHERE id=x.s3;
 -- Reusing an explicit repeat key is also idempotent.
 result:=create_workflow_instance(x.firm,x.actor,x.student,x.template,jsonb_build_object('name','Intentional repeat','student_college_id',x.sc2,'repeat_key',repeat_id),steps);
 again:=create_workflow_instance(x.firm,x.actor,x.student,x.template,jsonb_build_object('name','Retry repeat','student_college_id',x.sc2,'repeat_key',repeat_id),steps);
 PERFORM pg_temp.assert(result->>'id'=again->>'id' AND (result->>'id')::uuid<>x.w2,'repeat requires distinct intent and retries reuse it');
END $$;
DO $$ DECLARE x plan_test; preview jsonb; denied boolean:=false; BEGIN
 SELECT * INTO x FROM plan_test;
 preview:=preview_application_schedule(x.firm,x.actor,x.a1,'2026-12-01','rd');
 PERFORM pg_temp.assert(jsonb_array_length(preview->'changes')=1,'proposal excludes manual, completed and other college dates');
 PERFORM pg_temp.assert(preview->'changes'->0->>'new_date'='2026-11-21','stored deadline offset determines new date');
 PERFORM update_application_schedule(x.firm,x.actor,x.a1,'2026-12-01','rd',true,preview);
 PERFORM pg_temp.assert((SELECT due_date='2026-11-21' FROM student_workflow_steps WHERE id=x.s1),'accepted step date updated');
 PERFORM pg_temp.assert((SELECT due_on='2026-11-21' AND due_at=plan_due_at('2026-11-21',due_timezone) FROM tasks WHERE id=x.task1),'linked task and date semantics updated atomically');
 PERFORM pg_temp.assert((SELECT bool_and(due_date='2026-10-22') FROM student_workflow_steps WHERE id IN (x.s2,x.s3)),'manual and completed dates preserved');
 PERFORM pg_temp.assert((SELECT bool_and(due_date='2026-12-22') FROM student_workflow_steps WHERE student_workflow_id=x.w2),'other college preserved');
 preview:=preview_application_schedule(x.firm,x.actor,x.a1,'2026-12-15','rd');
 PERFORM edit_plan_step(x.firm,x.actor,x.s1,(SELECT updated_at FROM student_workflow_steps WHERE id=x.s1),
   jsonb_build_object('title','Personalized','description','Instance only','owner',x.owner,'ownerRole','student','ownerReady',true,'priority','urgent','due','2026-11-30'));
 BEGIN PERFORM update_application_schedule(x.firm,x.actor,x.a1,'2026-12-15','rd',true,preview);EXCEPTION WHEN OTHERS THEN denied:=true;END;
 PERFORM pg_temp.assert(denied,'stale schedule preview conflicts after manual edit');
 PERFORM pg_temp.assert((SELECT deadline_at::date='2026-12-01' FROM applications WHERE id=x.a1 AND firm_id=x.firm),'stale schedule does not partially save application');
 PERFORM pg_temp.assert((SELECT name='Draft' FROM workflow_template_steps WHERE id=x.ts1),'instance edits do not alter template');
 PERFORM pg_temp.assert((SELECT title='Personalized' AND priority='urgent' FROM tasks WHERE id=x.task1),'instance settings update linked task');
 -- Template changes cannot affect future materialization of saved plans.
 UPDATE workflow_template_steps SET name='Changed template',description='New instructions',visibility_scope='staff',completion_mode='review_required',depends_on_step_id=x.ts1 WHERE id=x.ts2;
 PERFORM materialize_workflow_task(x.s2,x.firm,x.actor,x.owner,'student',true);
 PERFORM pg_temp.assert((SELECT t.title='Manual date' AND t.description='Saved instructions' AND t.visibility_scope='family' AND t.completion_mode='simple'
   FROM tasks t JOIN student_workflow_steps s ON s.linked_task_id=t.id WHERE s.id=x.s2),'saved settings and null dependency survive template changes');
END $$;
-- Real authenticated portal callers cannot publish, personalize, or change schedules.
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student","role":"authenticated"}',true);
DO $$ DECLARE x plan_test; denied boolean:=false; BEGIN SELECT * INTO x FROM plan_test;
 BEGIN PERFORM preview_application_schedule(x.firm,x.owner,x.a1,'2027-01-01','rd');EXCEPTION WHEN OTHERS THEN denied:=true;END;
 PERFORM pg_temp.assert(denied,'student cannot preview staff schedule mutations');
 denied:=false;BEGIN PERFORM edit_plan_step(x.firm,x.owner,x.s2,now(),'{}');EXCEPTION WHEN OTHERS THEN denied:=true;END;
 PERFORM pg_temp.assert(denied,'student cannot personalize counselor plans');
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1","role":"authenticated"}',true);
DO $$ DECLARE x plan_test; denied boolean:=false; BEGIN SELECT * INTO x FROM plan_test;
 BEGIN PERFORM preview_application_schedule(x.firm,'a0000000-0000-4000-8000-000000000013',x.a1,'2027-01-01','rd');EXCEPTION WHEN OTHERS THEN denied:=true;END;
 PERFORM pg_temp.assert(denied,'parent cannot change staff schedules');END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_beta_counselor","role":"authenticated"}',true);
DO $$ DECLARE x plan_test; denied boolean:=false; BEGIN SELECT * INTO x FROM plan_test;
 BEGIN PERFORM preview_application_schedule(x.firm,x.actor,x.a1,'2027-01-01','rd');EXCEPTION WHEN OTHERS THEN denied:=true;END;
 PERFORM pg_temp.assert(denied,'cross-firm schedule access denied');END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor","role":"authenticated"}',true);
DO $$ DECLARE x plan_test; denied boolean:=false; existing_date date; existing_owner uuid; BEGIN
 SELECT * INTO x FROM plan_test;
 -- A stale assignment source cannot create a partial repeat plan.
 BEGIN PERFORM create_workflow_instance(x.firm,x.actor,x.student,x.template,
   jsonb_build_object('name','Stale repeat','student_college_id',x.sc1,'repeat_key',gen_random_uuid(),
     'source_checks',jsonb_build_object('student',jsonb_build_object('updated_at','2000-01-01'),'applications','[]'::jsonb)),
   '[]'::jsonb);EXCEPTION WHEN OTHERS THEN denied:=true;END;
 PERFORM pg_temp.assert(denied,'stale assignment source conflicts');
 PERFORM pg_temp.assert(NOT EXISTS(SELECT 1 FROM student_workflows WHERE firm_id=x.firm AND name='Stale repeat'),'stale assignment leaves no partial plan');
 denied:=false;
 -- A scoped legacy freeze is repeatable and does not change dates or owners.
 UPDATE student_workflow_steps SET snapshot_json=NULL WHERE id=x.s2;
 SELECT due_date,assigned_user_id INTO existing_date,existing_owner FROM student_workflow_steps WHERE id=x.s2;
 BEGIN UPDATE workflow_template_steps SET name='Would change legacy plan' WHERE id=x.ts2;EXCEPTION WHEN OTHERS THEN denied:=true;END;
 PERFORM pg_temp.assert(denied,'template edit cannot silently change legacy plan');
 PERFORM freeze_plan_settings(x.firm,x.actor,x.w1);
 PERFORM freeze_plan_settings(x.firm,x.actor,x.w1);
 PERFORM pg_temp.assert((SELECT due_date=existing_date AND assigned_user_id=existing_owner AND snapshot_json->>'dueSource'='legacy' FROM student_workflow_steps WHERE id=x.s2),'legacy freeze preserves date, identity and unknown provenance');
 -- Calendar input and timed input stay distinct.
 INSERT INTO tasks(firm_id,student_id,title,task_type,visibility_scope,status,priority,due_on,created_by_user_id,updated_by_user_id)
 VALUES(x.firm,x.student,'Calendar input','general','student','pending','medium','2026-11-01',x.actor,x.actor);
 PERFORM pg_temp.assert((SELECT due_at=plan_due_at(due_on,due_timezone) FROM tasks WHERE firm_id=x.firm AND title='Calendar input'),'date-picker input gets end-of-day semantics');
 INSERT INTO tasks(firm_id,student_id,title,task_type,visibility_scope,status,priority,due_at,created_by_user_id,updated_by_user_id)
 VALUES(x.firm,x.student,'Timed input','general','student','pending','medium','2026-11-01 14:00+00',x.actor,x.actor);
 PERFORM pg_temp.assert((SELECT due_at='2026-11-01 14:00+00'::timestamptz AND due_on IS NULL FROM tasks WHERE firm_id=x.firm AND title='Timed input'),'timed input retains exact instant');
END $$;
RESET ROLE;
SELECT pg_temp.assert(plan_due_at('2026-03-08','America/New_York')='2026-03-09 03:59:59.999+00'::timestamptz,'spring DST end of calendar day');
SELECT pg_temp.assert(plan_due_at('2026-11-01','America/New_York')='2026-11-02 04:59:59.999+00'::timestamptz,'fall DST end of calendar day');
SELECT pg_temp.assert(plan_due_at('2026-09-09','Pacific/Auckland')='2026-09-09 11:59:59.999+00'::timestamptz,'positive offset calendar day');
SELECT pg_temp.assert(plan_due_at('2026-09-09','America/Los_Angeles')>'2026-09-09 23:00+00'::timestamptz,'not overdue at start of intended day');
ROLLBACK;
