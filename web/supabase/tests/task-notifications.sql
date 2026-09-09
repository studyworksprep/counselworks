\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'Assertion failed: %',msg; END IF; END $$;
CREATE TEMP TABLE notice_test AS SELECT
 'a0000000-0000-4000-8000-000000000001'::uuid firm,'a0000000-0000-4000-8000-000000000012'::uuid actor,
 'a0000000-0000-4000-8000-000000000015'::uuid owner,'a0000000-0000-4000-8000-000000000041'::uuid student,
 gen_random_uuid() task,gen_random_uuid() hidden,gen_random_uuid() pending,gen_random_uuid() parent_task,
 gen_random_uuid() review_task,gen_random_uuid() blocked_task,gen_random_uuid() template,gen_random_uuid() ts1,gen_random_uuid() ts2,gen_random_uuid() workflow,gen_random_uuid() s1,gen_random_uuid() s2;
GRANT ALL ON notice_test TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor","role":"authenticated"}',true);
INSERT INTO tasks(id,firm_id,student_id,title,task_type,status,priority,visibility_scope,assigned_user_id,reviewer_user_id,created_by_user_id,updated_by_user_id,due_at)
 SELECT task,firm,student,'Review me','general','pending','medium','student',owner,actor,actor,actor,now()-interval '2 days' FROM notice_test;
INSERT INTO tasks(id,firm_id,student_id,title,task_type,status,priority,visibility_scope,assigned_user_id,owner_pending,created_by_user_id,updated_by_user_id,due_at)
 SELECT hidden,firm,student,'Private title','general','pending','medium','staff',owner,false,actor,actor,now()-interval '1 day' FROM notice_test UNION ALL
 SELECT pending,firm,student,'Unresolved','general','pending','medium','student',NULL,true,actor,actor,now()-interval '1 day' FROM notice_test UNION ALL
 SELECT parent_task,firm,student,'One parent only','general','pending','medium','family','a0000000-0000-4000-8000-000000000013',false,actor,actor,now()-interval '1 day' FROM notice_test;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student","role":"authenticated"}',true);
DO $$ DECLARE x notice_test; denied boolean:=false; BEGIN SELECT * INTO x FROM notice_test;
 PERFORM pg_temp.assert((SELECT count(*)=1 FROM notifications WHERE task_id=x.task),'student receives assignment immediately');
 PERFORM pg_temp.assert(NOT EXISTS(SELECT 1 FROM notifications WHERE task_id IN (x.hidden,x.pending,x.parent_task)),'hidden, unresolved and other owners never enter student feed');
 UPDATE tasks SET status='submitted',updated_by_user_id=x.owner WHERE id=x.task AND firm_id=x.firm;
 UPDATE tasks SET status='submitted',updated_by_user_id=x.owner WHERE id=x.task AND firm_id=x.firm;
 BEGIN INSERT INTO notifications(firm_id,user_id,kind,title,task_id,event_key,email_state) VALUES(x.firm,x.owner,'task_assigned','Forged',x.task,'forged','queued');EXCEPTION WHEN OTHERS THEN denied:=true;END;
 PERFORM pg_temp.assert(denied,'client cannot forge task delivery payloads');
 denied:=false;BEGIN UPDATE notifications SET email_state='queued',title='Changed' WHERE task_id=x.task;EXCEPTION WHEN OTHERS THEN denied:=true;END;
 PERFORM pg_temp.assert(denied,'client cannot edit protected payload or delivery state');
 UPDATE notifications SET read_at=now() WHERE task_id=x.task;
 PERFORM pg_temp.assert(NOT EXISTS(SELECT 1 FROM audit_events WHERE event_key IS NOT NULL),'portal cannot read task audit titles');
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor","role":"authenticated"}',true);
DO $$ DECLARE x notice_test; BEGIN SELECT * INTO x FROM notice_test;
 PERFORM pg_temp.assert((SELECT count(*)=1 FROM notifications WHERE task_id=x.task AND kind='task_submitted'),'reviewer receives one submission despite retry');
 PERFORM pg_temp.assert((SELECT count(*)=1 FROM audit_events WHERE entity_id=x.task AND action_type='task_submitted'),'submission audit is idempotent');
 UPDATE tasks SET status='changes_requested',updated_by_user_id=x.actor WHERE id=x.task AND firm_id=x.firm;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student","role":"authenticated"}',true);
SELECT pg_temp.assert((SELECT count(*)=1 FROM notifications WHERE task_id=(SELECT task FROM notice_test) AND kind='task_changes_requested'),'changes requested reaches actual owner');
UPDATE tasks SET status='submitted',updated_by_user_id=(SELECT owner FROM notice_test) WHERE id=(SELECT task FROM notice_test);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor","role":"authenticated"}',true);
UPDATE tasks SET status='completed',completed_at=now(),updated_by_user_id=(SELECT actor FROM notice_test) WHERE id=(SELECT task FROM notice_test);
UPDATE tasks SET status='completed',completed_at=now() WHERE id=(SELECT task FROM notice_test);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student","role":"authenticated"}',true);
SELECT pg_temp.assert((SELECT count(*)=1 FROM notifications WHERE task_id=(SELECT task FROM notice_test) AND kind='task_approved'),'accepted completion produces one owner notice');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1","role":"authenticated"}',true);
SELECT pg_temp.assert((SELECT count(*)=1 FROM notifications WHERE task_id=(SELECT parent_task FROM notice_test)),'selected parent receives its own notice');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent2","role":"authenticated"}',true);
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM notifications WHERE task_id=(SELECT parent_task FROM notice_test)),'other parent never receives a copy');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_beta_counselor","role":"authenticated"}',true);
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM notifications WHERE task_id IN (SELECT task FROM notice_test UNION SELECT parent_task FROM notice_test)),'cross-firm notices denied');
RESET ROLE;
-- One publication notice per real owner across all initially materialized steps.
INSERT INTO workflow_templates(id,firm_id,name,workflow_type) SELECT template,firm,'Notice plan','custom' FROM notice_test;
INSERT INTO workflow_template_steps(id,workflow_template_id,name,step_order,step_type,visibility_scope)
 SELECT ts1,template,'First step',0,'task','family' FROM notice_test UNION ALL SELECT ts2,template,'Second step',1,'task','family' FROM notice_test;
INSERT INTO student_workflows(id,firm_id,student_id,workflow_template_id,name,created_by_user_id) SELECT workflow,firm,student,template,'Notice plan',actor FROM notice_test;
INSERT INTO student_workflow_steps(id,student_workflow_id,template_step_id,assigned_user_id,status)
 SELECT s1,workflow,ts1,owner,'pending' FROM notice_test UNION ALL SELECT s2,workflow,ts2,owner,'pending' FROM notice_test;
DO $$ DECLARE x notice_test; BEGIN SELECT * INTO x FROM notice_test;
 PERFORM materialize_workflow_task(x.s1,x.firm,x.actor,x.owner,'student',true);
 PERFORM materialize_workflow_task(x.s2,x.firm,x.actor,x.owner,'student',true);
 PERFORM pg_temp.assert((SELECT count(*)=1 FROM notifications WHERE workflow_id=x.workflow AND user_id=x.owner AND kind='plan_published'),'plan publication is consolidated');
 -- The future action gets its own assignment after the plan has started.
 UPDATE tasks SET status='completed',completed_at=now() WHERE id=(SELECT linked_task_id FROM student_workflow_steps WHERE id=x.s1);
 UPDATE tasks SET due_at=now()-interval '1 day' WHERE id=(SELECT linked_task_id FROM student_workflow_steps WHERE id=x.s2);
 INSERT INTO tasks(id,firm_id,student_id,title,task_type,status,priority,visibility_scope,assigned_user_id,reviewer_user_id,created_by_user_id,updated_by_user_id,due_at,dependency_blocked)
 VALUES(x.review_task,x.firm,x.student,'Overdue review','general','submitted','medium','student',x.owner,x.actor,x.actor,x.actor,now()-interval '1 day',false),
       (x.blocked_task,x.firm,x.student,'Waiting prerequisite','general','pending','medium','student',x.owner,x.actor,x.actor,x.actor,now()-interval '1 day',true);
 PERFORM enqueue_task_reminders(now());PERFORM enqueue_task_reminders(now());
 PERFORM pg_temp.assert((SELECT count(*)=1 FROM notifications WHERE task_id=x.review_task AND kind='task_reminder' AND user_id=x.actor),'overdue submitted work reminds reviewer');
 PERFORM pg_temp.assert(NOT EXISTS(SELECT 1 FROM notifications WHERE task_id=x.review_task AND kind='task_reminder' AND user_id=x.owner),'submitted work does not remind student');
 PERFORM pg_temp.assert(NOT EXISTS(SELECT 1 FROM notifications WHERE task_id=x.blocked_task AND kind='task_reminder'),'blocked prerequisites are not reminded');
 PERFORM pg_temp.assert((SELECT count(*)=1 FROM notifications WHERE task_id=x.parent_task AND kind='task_reminder'),'overdue work is reminded once per firm day');
 PERFORM pg_temp.assert(NOT EXISTS(SELECT 1 FROM notifications WHERE task_id IN (x.hidden,x.pending) AND kind='task_reminder'),'reminders exclude hidden and unresolved work');
 PERFORM pg_temp.assert(NOT EXISTS(SELECT 1 FROM notifications WHERE task_id=x.task AND kind='task_reminder'),'completed work not reminded');
END $$;
-- Claimed rows cannot be claimed concurrently before lease expiry; stale uncertain
-- sends leave automatic retry before provider idempotency expires.
CREATE TEMP TABLE claims AS SELECT * FROM claim_task_notices(200);
SELECT pg_temp.assert((SELECT count(*)>0 FROM claims),'delivery drain claims real queued notices');
SELECT pg_temp.assert((SELECT count(*)=0 FROM claim_task_notices(200)),'second worker cannot claim same receipts');
UPDATE notifications SET email_claimed_at=now()-interval '6 minutes' WHERE id IN (SELECT id FROM claims);
SELECT pg_temp.assert((SELECT count(*)>0 FROM claim_task_notices(200)),'expired leases recover');
UPDATE notifications SET email_first_attempt_at=now()-interval '24 hours' WHERE id IN (SELECT id FROM claims);
SELECT pg_temp.assert((SELECT count(*)=0 FROM claim_task_notices(200)),'uncertain old sends do not repeat beyond idempotency window');
SELECT pg_temp.assert((SELECT bool_and(email_state='needs_attention') FROM notifications WHERE id IN (SELECT id FROM claims)),'old delivery receipts require attention');
-- Revoking task visibility hides earlier feed contents immediately.
UPDATE tasks SET visibility_scope='staff' WHERE id=(SELECT task FROM notice_test);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student","role":"authenticated"}',true);
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM notifications WHERE task_id=(SELECT task FROM notice_test)),'access revocation removes old notice text');
ROLLBACK;
