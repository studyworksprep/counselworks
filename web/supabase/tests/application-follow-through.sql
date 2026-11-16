\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'Assertion failed: %',msg; END IF; END $$;
CREATE FUNCTION pg_temp.must_fail(statement text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean:=false; BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN insufficient_privilege OR check_violation OR raise_exception OR foreign_key_violation OR unique_violation THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'Expected rejection: %',statement; END IF;
END $$;
CREATE TEMP TABLE x AS SELECT
 'a0000000-0000-4000-8000-000000000001'::uuid firm,'a0000000-0000-4000-8000-000000000012'::uuid actor,
 'a0000000-0000-4000-8000-000000000015'::uuid student_user,'a0000000-0000-4000-8000-000000000013'::uuid parent,
 'a0000000-0000-4000-8000-000000000041'::uuid student,gen_random_uuid() college,gen_random_uuid() school,gen_random_uuid() app,gen_random_uuid() item,gen_random_uuid() receipt,NULL::uuid task;
GRANT ALL ON x TO authenticated;
INSERT INTO colleges(id,name,slug) SELECT college,'Follow-through test','follow-through-sql-test' FROM x;
INSERT INTO student_colleges(id,firm_id,student_id,college_id,category,created_by_user_id,updated_by_user_id) SELECT school,firm,student,college,'target',actor,actor FROM x;
INSERT INTO applications(id,firm_id,student_id,student_college_id,college_id,application_type,stage,created_by_user_id,updated_by_user_id)
 SELECT app,firm,student,school,college,'rd','submitted',actor,actor FROM x;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
INSERT INTO application_follow_through_items(id,firm_id,student_id,application_id,kind,title,status,created_by_user_id,updated_by_user_id)
 SELECT item,firm,student,app,'material','School transcript','needed',actor,actor FROM x;
INSERT INTO application_follow_through_items(id,firm_id,student_id,application_id,kind,title,status,created_by_user_id,updated_by_user_id)
 SELECT receipt,firm,student,app,'receipt','Application acknowledgment','awaiting',actor,actor FROM x;
SELECT pg_temp.must_fail($q$UPDATE application_follow_through_items SET family_shared=true,revision=revision+1 WHERE id=(SELECT item FROM x)$q$);
SELECT pg_temp.must_fail($q$SELECT public.create_application_follow_up(firm,actor,item,1,parent,current_date) FROM x$q$);
SELECT pg_temp.must_fail($q$UPDATE application_follow_through_items SET received_on=current_date,revision=revision+1 WHERE id=(SELECT item FROM x)$q$);
SELECT pg_temp.must_fail($q$UPDATE application_follow_through_items SET checked_on=current_date+3,revision=revision+1 WHERE id=(SELECT item FROM x)$q$);
SELECT pg_temp.must_fail($q$UPDATE application_follow_through_items SET notes='stale',revision=1 WHERE id=(SELECT item FROM x)$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM application_follow_through_items),'unshared tracking hidden');
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
UPDATE application_follow_through_items SET family_shared=true,revision=revision+1,updated_by_user_id=(SELECT student_user FROM x) WHERE id=(SELECT item FROM x);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
UPDATE x SET task=public.create_application_follow_up(firm,actor,item,2,parent,current_date-1);
SELECT pg_temp.assert(public.create_application_follow_up(firm,actor,item,2,parent,current_date-1)=task,'duplicate request returns same open task') FROM x;
SELECT pg_temp.must_fail($q$SELECT public.create_application_follow_up(firm,actor,item,2,student_user,current_date) FROM x$q$);
SELECT pg_temp.must_fail($q$UPDATE tasks SET follow_through_item_id=NULL WHERE id=(SELECT task FROM x)$q$);
SELECT pg_temp.must_fail($q$UPDATE tasks SET review_feedback='Unapproved private feedback' WHERE id=(SELECT task FROM x)$q$);
SELECT pg_temp.must_fail($q$UPDATE tasks SET title='Private changed title' WHERE id=(SELECT task FROM x)$q$);
SELECT pg_temp.must_fail($q$UPDATE tasks SET visibility_scope='staff' WHERE id=(SELECT task FROM x)$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent2"}',true);
SELECT pg_temp.assert((SELECT count(*)=1 FROM application_follow_through_items),'both parents see only shared item');
SELECT pg_temp.must_fail($q$SELECT public.transition_task(firm,'a0000000-0000-4000-8000-000000000014',task,'completed') FROM x$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
SELECT pg_temp.assert(public.task_notice_allowed(task,parent),'parent notification authorized') FROM x;
SELECT public.transition_task(firm,parent,task,'completed') FROM x;
SELECT pg_temp.assert((SELECT status='needed' FROM application_follow_through_items WHERE id=x.item),'task completion does not confirm receipt') FROM x;
SELECT public.transition_task(firm,parent,task,'pending') FROM x;
-- A student change must withdraw the source, derived lists, direct reads and queued notifications atomically.
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
UPDATE application_follow_through_items SET notes='New student-only details',revision=revision+1,updated_by_user_id=(SELECT student_user FROM x) WHERE id=(SELECT item FROM x);
SELECT pg_temp.assert((SELECT visibility_scope='student' FROM tasks WHERE id=x.task),'task audience narrowed') FROM x;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_parent1"}',true);
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM tasks WHERE follow_through_item_id=(SELECT item FROM x)),'parent direct task read revoked');
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM notifications WHERE task_id=(SELECT task FROM x)),'queued notification feed revoked');
SELECT pg_temp.must_fail($q$SELECT public.transition_task(firm,parent,task,'completed') FROM x$q$);
RESET ROLE;
SELECT pg_temp.assert(NOT public.task_notice_allowed(task,parent),'service delivery also revoked') FROM x;
SELECT public.enqueue_task_reminders();
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM notifications WHERE task_id=x.task AND kind='task_reminder'),'no reminder generated while consent withdrawn') FROM x;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
UPDATE application_follow_through_items SET family_shared=true,revision=revision+1,updated_by_user_id=(SELECT student_user FROM x) WHERE id=(SELECT item FROM x);
RESET ROLE;
SELECT public.enqueue_task_reminders();SELECT public.enqueue_task_reminders();
SELECT pg_temp.assert((SELECT count(*)=1 FROM notifications WHERE task_id=x.task AND kind='task_reminder'),'reminders deduplicate') FROM x;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
UPDATE application_follow_through_items SET status='received',received_on=current_date,revision=revision+1,updated_by_user_id=(SELECT student_user FROM x) WHERE id=(SELECT item FROM x);
SELECT pg_temp.assert((SELECT status='cancelled' FROM tasks WHERE id=x.task),'confirmed receipt cancels remaining follow-up') FROM x;
SELECT pg_temp.must_fail($q$SELECT public.create_application_follow_up(firm,student_user,item,5,student_user,current_date) FROM x$q$);
-- Reopen tracking without rewriting task history; assign a fresh student follow-up.
UPDATE application_follow_through_items SET status='needed',received_on=NULL,revision=revision+1,updated_by_user_id=(SELECT student_user FROM x) WHERE id=(SELECT item FROM x);
UPDATE x SET task=public.create_application_follow_up(firm,student_user,item,6,student_user,current_date);
SELECT pg_temp.must_fail($q$UPDATE tasks SET assigned_user_id=(SELECT parent FROM x) WHERE id=(SELECT task FROM x)$q$);
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_beta_owner"}',true);
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM application_follow_through_items),'cross-firm reads denied');
SELECT pg_temp.must_fail($q$SELECT public.create_application_follow_up(firm,'b0000000-0000-4000-8000-000000000011',item,6,student_user,current_date) FROM x$q$);
RESET ROLE;
DELETE FROM student_staff_assignments WHERE firm_id=(SELECT firm FROM x) AND student_id=(SELECT student FROM x) AND user_id=(SELECT actor FROM x);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_counselor"}',true);
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM application_follow_through_items),'unassigned counselor denied');
SELECT pg_temp.must_fail($q$SELECT public.create_application_follow_up(firm,actor,item,6,student_user,current_date) FROM x$q$);
RESET ROLE;
SELECT pg_temp.must_fail($q$SELECT public.create_application_follow_up(firm,actor,item,6,student_user,current_date) FROM x$q$);
-- Read-only staff retain reads without mutation, including the service fallback.
UPDATE firm_memberships SET role='read_only_staff' WHERE firm_id=(SELECT firm FROM x) AND user_id=(SELECT actor FROM x);
SELECT pg_temp.must_fail($q$UPDATE application_follow_through_items SET notes='readonly edit',revision=revision+1,updated_by_user_id=(SELECT actor FROM x) WHERE id=(SELECT item FROM x)$q$);
SELECT pg_temp.must_fail($q$SELECT public.create_application_follow_up(firm,actor,item,6,student_user,current_date) FROM x$q$);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
UPDATE application_follow_through_items SET family_shared=true,revision=revision+1,updated_by_user_id=(SELECT student_user FROM x) WHERE id=(SELECT item FROM x);
RESET ROLE;
UPDATE applications SET stage='withdrawn' WHERE id=(SELECT app FROM x) AND firm_id=(SELECT firm FROM x);
SELECT pg_temp.assert(NOT public.task_notice_allowed(task,student_user),'withdrawn application suppresses reminders') FROM x;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"test_clerk_alpha_student"}',true);
UPDATE application_follow_through_items SET family_shared=false,revision=revision+1,updated_by_user_id=(SELECT student_user FROM x) WHERE id=(SELECT item FROM x);
SELECT pg_temp.assert((SELECT NOT family_shared FROM application_follow_through_items WHERE id=x.item),'student can revoke consent after withdrawal') FROM x;
SELECT pg_temp.must_fail($q$UPDATE application_follow_through_items SET notes='withdrawn edit',revision=revision+1,updated_by_user_id=(SELECT student_user FROM x) WHERE id=(SELECT item FROM x)$q$);
RESET ROLE;
-- Every new function is invoker-only with fixed search_path and no anonymous execution.
SELECT pg_temp.assert(NOT EXISTS(SELECT 1 FROM pg_proc WHERE proname IN ('guard_application_follow_through','guard_follow_through_task','sync_follow_through_tasks','create_application_follow_up') AND (prosecdef OR proconfig IS NULL OR has_function_privilege('anon',oid,'EXECUTE'))),'function security');
ROLLBACK;
