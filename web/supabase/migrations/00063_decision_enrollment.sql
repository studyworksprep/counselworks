-- Decision facts retain the existing family audience. Working next steps require student consent.
ALTER TABLE applications ADD COLUMN decision_revision integer NOT NULL DEFAULT 0 CHECK(decision_revision>=0);
CREATE TABLE application_decision_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), firm_id uuid NOT NULL REFERENCES firms(id),
 student_id uuid NOT NULL REFERENCES students(id), application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision>=0), result text NOT NULL CHECK(result IN ('accepted','rejected','waitlisted','deferred')),
 decided_on date, deposit_status text CHECK(deposit_status IN ('committed','declined')),
 origin text NOT NULL DEFAULT 'recorded' CHECK(origin IN ('recorded','existing_record')),
 recorded_by_user_id uuid REFERENCES users(id), recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(firm_id,application_id,revision), CHECK(result='accepted' OR deposit_status IS NULL)
);
CREATE INDEX decision_events_student ON application_decision_events(firm_id,student_id,application_id);
ALTER TABLE application_decision_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY decision_events_read ON application_decision_events FOR SELECT TO authenticated USING(public.interview_can_access(firm_id,student_id));
CREATE POLICY decision_events_insert ON application_decision_events FOR INSERT TO authenticated WITH CHECK(public.interview_can_write_bank(firm_id,student_id) AND public.current_member_role()<>'student');
-- Preserve only actual current facts, explicitly labeled as predating history; do not reconstruct earlier outcomes or authors.
INSERT INTO application_decision_events(firm_id,student_id,application_id,revision,result,decided_on,deposit_status,origin)
 SELECT a.firm_id,a.student_id,a.id,0,a.decision_result,a.decision_at::date,
 CASE WHEN a.decision_result='accepted' AND s.deposit_status IN ('committed','declined') THEN s.deposit_status END,'existing_record'
 FROM applications a LEFT JOIN student_colleges s ON s.id=a.student_college_id AND s.firm_id=a.firm_id
 WHERE a.decision_result IN ('accepted','rejected','waitlisted','deferred');

CREATE TABLE application_next_steps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),firm_id uuid NOT NULL REFERENCES firms(id),student_id uuid NOT NULL REFERENCES students(id),
 application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,decision_revision integer NOT NULL CHECK(decision_revision>=0),
 template_key text,kind text NOT NULL CHECK(kind IN ('waitlist','deferral','enrollment')),title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),
 status text NOT NULL DEFAULT 'needed' CHECK(status IN ('needed','in_progress','completed','waived')),
 due_on date,completed_on date,notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000),
 essay_id uuid REFERENCES essay_drafts(id) ON DELETE RESTRICT,document_id uuid REFERENCES documents(id) ON DELETE RESTRICT,
 family_shared boolean NOT NULL DEFAULT false,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by_user_id uuid NOT NULL REFERENCES users(id),updated_by_user_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status='completed')=(completed_on IS NOT NULL))
);
CREATE UNIQUE INDEX next_steps_template ON application_next_steps(firm_id,application_id,decision_revision,template_key) WHERE template_key IS NOT NULL;
CREATE INDEX next_steps_application ON application_next_steps(firm_id,student_id,application_id);
CREATE INDEX next_steps_essay ON application_next_steps(essay_id) WHERE essay_id IS NOT NULL;
CREATE INDEX next_steps_document ON application_next_steps(document_id) WHERE document_id IS NOT NULL;
ALTER TABLE application_next_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY next_steps_read ON application_next_steps FOR SELECT TO authenticated USING(public.interview_can_access(firm_id,student_id) AND (public.current_member_role()<>'parent_guardian' OR family_shared));
CREATE POLICY next_steps_insert ON application_next_steps FOR INSERT TO authenticated WITH CHECK(public.interview_can_write_bank(firm_id,student_id));
CREATE POLICY next_steps_update ON application_next_steps FOR UPDATE TO authenticated USING(public.interview_can_write_bank(firm_id,student_id)) WITH CHECK(public.interview_can_write_bank(firm_id,student_id));
ALTER TABLE tasks ADD COLUMN application_next_step_id uuid REFERENCES application_next_steps(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX next_step_open_task ON tasks(firm_id,application_next_step_id) WHERE application_next_step_id IS NOT NULL AND archived_at IS NULL AND status NOT IN ('completed','cancelled');
CREATE INDEX next_step_task_source ON tasks(application_next_step_id) WHERE application_next_step_id IS NOT NULL;
CREATE POLICY tasks_next_step_source ON tasks AS RESTRICTIVE FOR SELECT TO authenticated USING(application_next_step_id IS NULL OR EXISTS(SELECT 1 FROM application_next_steps s WHERE s.id=application_next_step_id AND s.firm_id=tasks.firm_id AND s.student_id=tasks.student_id));

CREATE FUNCTION public.next_step_current(p_application uuid,p_revision integer,p_kind text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM applications a LEFT JOIN student_colleges c ON c.id=a.student_college_id AND c.firm_id=a.firm_id
 WHERE a.id=p_application AND a.decision_revision=p_revision AND a.stage='decision_received'
 AND a.decision_result=CASE p_kind WHEN 'waitlist' THEN 'waitlisted' WHEN 'deferral' THEN 'deferred' WHEN 'enrollment' THEN 'accepted' END
 AND (p_kind<>'enrollment' OR c.deposit_status IS DISTINCT FROM 'declined'))
$$;

CREATE FUNCTION public.guard_decision_event() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a applications;r text;today date;
BEGIN
 IF TG_OP<>'INSERT' THEN
  IF TG_OP='DELETE' AND pg_trigger_depth()>1 AND NOT EXISTS(SELECT 1 FROM applications WHERE id=OLD.application_id AND firm_id=OLD.firm_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Decision history cannot be changed; record a correction';
 END IF;
 PERFORM 1 FROM students WHERE id=NEW.student_id AND firm_id=NEW.firm_id FOR UPDATE;
 SELECT * INTO a FROM applications WHERE id=NEW.application_id AND firm_id=NEW.firm_id AND student_id=NEW.student_id FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
 r:=public.work_actor(NEW.firm_id,NEW.recorded_by_user_id,NEW.student_id);
 IF r NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Counselor decision access required'; END IF;
 IF NEW.revision<>a.decision_revision+1 OR NEW.origin<>'recorded' THEN RAISE EXCEPTION 'Decision changed. Refresh before saving.'; END IF;
 SELECT (now() AT TIME ZONE coalesce(timezone,'America/New_York'))::date INTO today FROM firms WHERE id=NEW.firm_id;
 IF NEW.decided_on IS NULL OR NEW.decided_on>today THEN RAISE EXCEPTION 'Choose a decision date that is not in the future'; END IF;
 IF NEW.deposit_status='committed' AND EXISTS(SELECT 1 FROM student_colleges WHERE firm_id=NEW.firm_id AND student_id=NEW.student_id AND id<>a.student_college_id AND deposit_status='committed') THEN RAISE EXCEPTION 'Another college is recorded as committed. Update that enrollment first.'; END IF;
 NEW.recorded_at:=now();RETURN NEW;
END $$;
CREATE TRIGGER guard_decision_event BEFORE INSERT OR UPDATE OR DELETE ON application_decision_events FOR EACH ROW EXECUTE FUNCTION public.guard_decision_event();

CREATE FUNCTION public.guard_decision_projection() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.decision_result IS NOT NULL THEN RAISE EXCEPTION 'Record the decision through its history'; END IF;
  IF TG_TABLE_NAME='applications' THEN
   IF NEW.decision_at IS NOT NULL OR NEW.decision_revision<>0 THEN RAISE EXCEPTION 'New applications start without a decision'; END IF;
  ELSIF NEW.deposit_status IS NOT NULL THEN RAISE EXCEPTION 'Record enrollment through the decision workspace'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='applications' THEN
  IF ROW(NEW.decision_result,NEW.decision_at,NEW.decision_revision) IS DISTINCT FROM ROW(OLD.decision_result,OLD.decision_at,OLD.decision_revision) AND
   (NEW.decision_revision<>OLD.decision_revision+1 OR NOT EXISTS(SELECT 1 FROM application_decision_events e WHERE e.firm_id=NEW.firm_id AND e.application_id=NEW.id AND e.revision=NEW.decision_revision AND e.result=NEW.decision_result AND e.decided_on=NEW.decision_at::date AND e.recorded_by_user_id=NEW.updated_by_user_id))
  THEN RAISE EXCEPTION 'Record the decision through its history'; END IF;
 ELSE
  IF ROW(NEW.decision_result,NEW.deposit_status) IS DISTINCT FROM ROW(OLD.decision_result,OLD.deposit_status) AND NOT EXISTS(
   SELECT 1 FROM applications a JOIN application_decision_events e ON e.application_id=a.id AND e.firm_id=a.firm_id AND e.revision=a.decision_revision
   WHERE a.student_college_id=NEW.id AND a.firm_id=NEW.firm_id AND e.result=NEW.decision_result AND e.deposit_status IS NOT DISTINCT FROM NEW.deposit_status AND e.recorded_by_user_id=NEW.updated_by_user_id)
  THEN RAISE EXCEPTION 'Record enrollment through the decision workspace'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_decision_projection BEFORE INSERT OR UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION public.guard_decision_projection();
CREATE TRIGGER guard_decision_projection BEFORE INSERT OR UPDATE ON student_colleges FOR EACH ROW EXECUTE FUNCTION public.guard_decision_projection();

CREATE FUNCTION public.apply_decision_event() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a applications;
BEGIN
 SELECT * INTO a FROM applications WHERE id=NEW.application_id AND firm_id=NEW.firm_id;
 UPDATE applications SET decision_result=NEW.result,decision_at=NEW.decided_on::timestamp AT TIME ZONE 'UTC',decision_revision=NEW.revision,stage='decision_received',updated_by_user_id=NEW.recorded_by_user_id,updated_at=now() WHERE id=NEW.application_id AND firm_id=NEW.firm_id;
 UPDATE student_colleges SET decision_result=NEW.result,deposit_status=NEW.deposit_status,updated_by_user_id=NEW.recorded_by_user_id,updated_at=now() WHERE id=a.student_college_id AND firm_id=NEW.firm_id;
 -- Previous work stays visible but must be reviewed against the new outcome before reminders resume.
 UPDATE tasks SET status='cancelled',updated_by_user_id=NEW.recorded_by_user_id WHERE firm_id=NEW.firm_id AND application_next_step_id IN (SELECT id FROM application_next_steps WHERE firm_id=NEW.firm_id AND application_id=NEW.application_id) AND archived_at IS NULL AND status NOT IN ('completed','cancelled');
 RETURN NULL;
END $$;
CREATE TRIGGER apply_decision_event AFTER INSERT ON application_decision_events FOR EACH ROW EXECUTE FUNCTION public.apply_decision_event();

CREATE FUNCTION public.record_application_decision(p_firm uuid,p_actor uuid,p_application uuid,p_revision integer,p_result text,p_date date,p_deposit text,p_follow_up boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a applications;next_revision integer;r text;
BEGIN
 SELECT * INTO a FROM applications WHERE id=p_application AND firm_id=p_firm;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
 PERFORM 1 FROM students WHERE id=a.student_id AND firm_id=p_firm FOR UPDATE;
 SELECT * INTO a FROM applications WHERE id=p_application AND firm_id=p_firm FOR UPDATE;
 r:=public.work_actor(p_firm,p_actor,a.student_id);
 IF r NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Counselor decision access required'; END IF;
 IF a.decision_revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Decision changed. Refresh before saving.'; END IF;
 IF p_deposit='committed' AND EXISTS(SELECT 1 FROM student_colleges WHERE firm_id=p_firm AND student_id=a.student_id AND id<>a.student_college_id AND deposit_status='committed') THEN RAISE EXCEPTION 'Another college is recorded as committed. Update that enrollment first.'; END IF;
 next_revision:=a.decision_revision+1;
 INSERT INTO application_decision_events(firm_id,student_id,application_id,revision,result,decided_on,deposit_status,recorded_by_user_id)
 VALUES(p_firm,a.student_id,a.id,next_revision,p_result,p_date,p_deposit,p_actor);
 IF p_follow_up AND p_result IN ('waitlisted','deferred') THEN
  INSERT INTO application_next_steps(firm_id,student_id,application_id,decision_revision,kind,title,created_by_user_id,updated_by_user_id)
  VALUES(p_firm,a.student_id,a.id,next_revision,CASE p_result WHEN 'waitlisted' THEN 'waitlist' ELSE 'deferral' END,'Confirm response instructions and plan an update letter',p_actor,p_actor);
 END IF;
 RETURN next_revision;
END $$;

CREATE FUNCTION public.guard_application_next_step() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a applications;r text;changed boolean;today date;sharing_only boolean:=false;
BEGIN
 SELECT * INTO a FROM applications WHERE id=NEW.application_id AND firm_id=NEW.firm_id AND student_id=NEW.student_id FOR SHARE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
 r:=public.work_actor(NEW.firm_id,NEW.updated_by_user_id,NEW.student_id);
 IF r NOT IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Next-step editing access required'; END IF;
 IF TG_OP='UPDATE' THEN
  sharing_only:=(to_jsonb(NEW)-ARRAY['revision','updated_at','updated_by_user_id','family_shared']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','updated_at','updated_by_user_id','family_shared']);
  IF ROW(NEW.id,NEW.firm_id,NEW.student_id,NEW.application_id,NEW.kind,NEW.template_key,NEW.created_by_user_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.firm_id,OLD.student_id,OLD.application_id,OLD.kind,OLD.template_key,OLD.created_by_user_id,OLD.created_at) THEN RAISE EXCEPTION 'Next-step identity cannot change'; END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Next step changed. Refresh before saving.'; END IF;
  changed:=NOT sharing_only;
  IF changed THEN NEW.family_shared:=false;
  ELSIF NEW.family_shared IS DISTINCT FROM OLD.family_shared AND r<>'student' THEN RAISE EXCEPTION 'Only the student can change parent sharing'; END IF;
 ELSE
  IF NEW.created_by_user_id IS DISTINCT FROM NEW.updated_by_user_id OR NEW.revision<>1 OR NEW.family_shared THEN RAISE EXCEPTION 'New next steps start with student and team access'; END IF;
  NEW.created_at:=now();
 END IF;
 IF NOT public.next_step_current(a.id,NEW.decision_revision,NEW.kind) AND NOT (TG_OP='UPDATE' AND sharing_only AND NOT NEW.family_shared) THEN RAISE EXCEPTION 'Review this step against the current decision before saving'; END IF;
 SELECT (now() AT TIME ZONE coalesce(timezone,'America/New_York'))::date INTO today FROM firms WHERE id=NEW.firm_id;
 IF NEW.completed_on>today THEN RAISE EXCEPTION 'Completion date cannot be in the future'; END IF;
 IF NEW.document_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.document_id IS DISTINCT FROM OLD.document_id) AND NOT EXISTS(SELECT 1 FROM documents WHERE id=NEW.document_id AND firm_id=NEW.firm_id AND student_id=NEW.student_id AND archived_at IS NULL AND visibility_scope IN ('student','family','firm')) THEN RAISE EXCEPTION 'Choose a document shared with this student'; END IF;
 IF NEW.essay_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.essay_id IS DISTINCT FROM OLD.essay_id) AND NOT EXISTS(SELECT 1 FROM essay_drafts WHERE id=NEW.essay_id AND firm_id=NEW.firm_id AND student_id=NEW.student_id AND application_id=a.id AND visibility_scope IN ('student','family','firm')) THEN RAISE EXCEPTION 'Choose writing shared with this student for this application'; END IF;
 NEW.updated_at:=now();RETURN NEW;
END $$;
CREATE TRIGGER guard_application_next_step BEFORE INSERT OR UPDATE ON application_next_steps FOR EACH ROW EXECUTE FUNCTION public.guard_application_next_step();
CREATE FUNCTION public.guard_next_step_task() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE i application_next_steps; r text; owner text; synced boolean:=false;
BEGIN
 IF TG_OP='UPDATE' AND OLD.application_next_step_id IS NOT NULL AND NEW.application_next_step_id IS DISTINCT FROM OLD.application_next_step_id THEN RAISE EXCEPTION 'Follow-up source cannot change'; END IF;
 IF NEW.application_next_step_id IS NULL THEN RETURN NEW; END IF;
 r:=public.work_actor(NEW.firm_id,NEW.updated_by_user_id,NEW.student_id);
 -- Parent completion never changes tracking. FOR SHARE requires UPDATE permission,
 -- which parents intentionally lack. Nested synchronization already owns its source/application lock.
 -- Avoid reacquiring the source after a decision change has locked the application.
 IF r='parent_guardian' OR pg_trigger_depth()>1 THEN
  SELECT * INTO i FROM application_next_steps WHERE id=NEW.application_next_step_id AND firm_id=NEW.firm_id AND student_id=NEW.student_id;
 ELSE
  SELECT * INTO i FROM application_next_steps WHERE id=NEW.application_next_step_id AND firm_id=NEW.firm_id AND student_id=NEW.student_id FOR SHARE;
 END IF;
 IF i.id IS NULL OR NEW.application_id IS DISTINCT FROM i.application_id OR NEW.related_entity_id IS DISTINCT FROM i.application_id OR NEW.related_entity_type IS DISTINCT FROM 'application'
  OR NEW.title IS DISTINCT FROM ('Next step: '||i.title) OR NEW.description IS DISTINCT FROM 'Open the decision and enrollment workspace and record the outcome. Completing this task does not confirm enrollment, payment, or delivery.'
  OR NEW.visibility_scope IS DISTINCT FROM (CASE WHEN i.family_shared THEN 'family' ELSE 'student' END)
  OR NEW.task_type<>'follow_up' OR NEW.completion_mode<>'simple' OR NEW.essay_feedback_id IS NOT NULL OR NEW.workflow_step_id IS NOT NULL OR NEW.reviewer_user_id IS NOT NULL
  OR NEW.follow_through_item_id IS NOT NULL OR NEW.review_feedback IS NOT NULL OR NEW.family_id IS NOT NULL OR NEW.submitted_version_id IS NOT NULL OR NEW.submitted_document_id IS NOT NULL OR NEW.due_on IS NULL OR NEW.owner_pending OR NEW.assigned_user_id IS NULL
 THEN RAISE EXCEPTION 'Follow-up tasks retain their source, instructions, audience, owner and due date'; END IF;
 r:=public.work_actor(NEW.firm_id,NEW.updated_by_user_id,NEW.student_id);
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW.firm_id,NEW.student_id,NEW.created_by_user_id) IS DISTINCT FROM ROW(OLD.id,OLD.firm_id,OLD.student_id,OLD.created_by_user_id) THEN RAISE EXCEPTION 'Follow-up identity cannot change'; END IF;
  synced:=pg_trigger_depth()>1 AND (to_jsonb(NEW)-ARRAY['title','visibility_scope','status','completed_at','updated_by_user_id','updated_at']) IS NOT DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['title','visibility_scope','status','completed_at','updated_by_user_id','updated_at']) AND
   (NEW.status=OLD.status OR (NEW.status='cancelled' AND (i.status IN ('completed','waived') OR NOT public.next_step_current(i.application_id,i.decision_revision,i.kind))));
 END IF;
 IF r NOT IN ('student','parent_guardian','firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Follow-up editing access required'; END IF;
 IF NOT synced THEN
  IF NEW.status NOT IN ('pending','in_progress','completed','cancelled') THEN RAISE EXCEPTION 'Follow-ups use simple task completion'; END IF;
  IF TG_OP='INSERT' AND (NEW.created_by_user_id IS DISTINCT FROM NEW.updated_by_user_id OR NEW.status<>'pending') THEN RAISE EXCEPTION 'New follow-ups start pending with the current actor'; END IF;
  IF NEW.status IN ('pending','in_progress') AND NOT public.next_step_current(i.application_id,i.decision_revision,i.kind) THEN RAISE EXCEPTION 'Review the step against the current decision before scheduling'; END IF;
  IF r IN ('student','parent_guardian') THEN
   IF NEW.assigned_user_id IS DISTINCT FROM NEW.updated_by_user_id OR (r='parent_guardian' AND (TG_OP='INSERT' OR NOT i.family_shared)) THEN RAISE EXCEPTION 'Update only your own shared follow-ups'; END IF;
   IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-(CASE WHEN r='student' THEN ARRAY['status','completed_at','updated_by_user_id','updated_at','due_on','due_at','due_timezone'] ELSE ARRAY['status','completed_at','updated_by_user_id','updated_at'] END)) IS DISTINCT FROM (to_jsonb(OLD)-(CASE WHEN r='student' THEN ARRAY['status','completed_at','updated_by_user_id','updated_at','due_on','due_at','due_timezone'] ELSE ARRAY['status','completed_at','updated_by_user_id','updated_at'] END)) OR OLD.status='cancelled' OR NEW.status NOT IN ('pending','in_progress','completed')) THEN RAISE EXCEPTION 'Portal owners update follow-up completion only'; END IF;
  END IF;
  IF TG_OP='INSERT' OR NEW.assigned_user_id IS DISTINCT FROM OLD.assigned_user_id THEN
   SELECT m.role INTO owner FROM firm_memberships m JOIN students s ON s.firm_id=m.firm_id AND s.id=NEW.student_id
    WHERE m.firm_id=NEW.firm_id AND m.user_id=NEW.assigned_user_id AND m.status='active' AND (
     m.role IN ('firm_owner','firm_admin') OR (m.role IN ('counselor','essay_coach','tutor') AND EXISTS(SELECT 1 FROM student_staff_assignments a WHERE a.firm_id=m.firm_id AND a.student_id=s.id AND a.user_id=m.user_id)) OR
     (m.role='student' AND s.user_id=m.user_id) OR (m.role='parent_guardian' AND EXISTS(SELECT 1 FROM family_members f WHERE f.firm_id=m.firm_id AND f.family_id=s.family_id AND f.user_id=m.user_id)));
   IF owner IS NULL THEN RAISE EXCEPTION 'Choose an active owner with access to this tracking item'; END IF;
   IF owner='read_only_staff' OR (owner='parent_guardian' AND NOT i.family_shared) OR NEW.owner_role IS DISTINCT FROM owner OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.assigned_user_id AND auth_provider_user_id NOT LIKE 'invited_%' AND auth_provider_user_id NOT LIKE 'pending_%') THEN RAISE EXCEPTION 'Choose an active owner with access to this tracking item'; END IF;
  ELSIF NEW.owner_role IS DISTINCT FROM OLD.owner_role THEN RAISE EXCEPTION 'Follow-up owner role cannot change independently'; END IF;
  IF NEW.status NOT IN ('completed','cancelled') AND (i.status IN ('completed','waived') OR NOT public.next_step_current(i.application_id,i.decision_revision,i.kind)) THEN RAISE EXCEPTION 'This tracking item is already resolved'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_next_step_task BEFORE INSERT OR UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION public.guard_next_step_task();

CREATE FUNCTION public.sync_next_step_tasks() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 UPDATE tasks SET title='Next step: '||NEW.title, visibility_scope=CASE WHEN NEW.family_shared THEN 'family' ELSE 'student' END,
  status=CASE WHEN NEW.status IN ('completed','waived') AND status NOT IN ('completed','cancelled') THEN 'cancelled' ELSE status END,
  updated_by_user_id=NEW.updated_by_user_id,updated_at=now()
 WHERE firm_id=NEW.firm_id AND student_id=NEW.student_id AND application_next_step_id=NEW.id;
 RETURN NULL;
END $$;
CREATE TRIGGER sync_next_step_tasks AFTER UPDATE ON application_next_steps FOR EACH ROW EXECUTE FUNCTION public.sync_next_step_tasks();

CREATE FUNCTION public.schedule_application_next_step(p_firm uuid,p_actor uuid,p_item uuid,p_revision integer,p_owner uuid,p_due date,p_task uuid DEFAULT NULL,p_expected bigint DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE i application_next_steps; r text; owner text; existing tasks; result uuid;
BEGIN
 SELECT * INTO i FROM application_next_steps WHERE id=p_item AND firm_id=p_firm FOR UPDATE;
 IF i.id IS NULL THEN RAISE EXCEPTION 'Tracking item not found'; END IF;
 r:=public.work_actor(p_firm,p_actor,i.student_id);
 IF r NOT IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor') OR (r='student' AND p_actor IS DISTINCT FROM p_owner) THEN RAISE EXCEPTION 'Follow-up editing access required'; END IF;
 IF i.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Tracking changed in another window. Refresh before saving.'; END IF;
 IF p_due IS NULL THEN RAISE EXCEPTION 'Choose a follow-up due date'; END IF;
 IF p_task IS NOT NULL THEN
  SELECT * INTO existing FROM tasks WHERE id=p_task AND firm_id=p_firm AND application_next_step_id=i.id AND archived_at IS NULL FOR UPDATE;
  IF existing.id IS NULL OR existing.status IN ('completed','cancelled') OR existing.notice_revision IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Follow-up changed in another window. Refresh before saving.'; END IF;
  SELECT role INTO owner FROM firm_memberships WHERE firm_id=p_firm AND user_id=p_owner AND status='active';
  UPDATE tasks SET assigned_user_id=p_owner,owner_role=owner,due_on=p_due,updated_by_user_id=p_actor WHERE id=p_task AND firm_id=p_firm;
  RETURN p_task;
 END IF;
 SELECT * INTO existing FROM tasks WHERE firm_id=p_firm AND application_next_step_id=i.id AND archived_at IS NULL AND status NOT IN ('completed','cancelled');
 IF existing.id IS NOT NULL THEN
  IF existing.assigned_user_id=p_owner AND existing.due_on=p_due THEN RETURN existing.id; END IF;
  RAISE EXCEPTION 'An open follow-up already exists. Refresh to manage it.';
 END IF;
 SELECT role INTO owner FROM firm_memberships WHERE firm_id=p_firm AND user_id=p_owner AND status='active';
 INSERT INTO tasks(firm_id,student_id,application_id,related_entity_type,related_entity_id,application_next_step_id,title,description,task_type,status,priority,visibility_scope,assigned_user_id,owner_role,owner_pending,due_on,completion_mode,created_by_user_id,updated_by_user_id)
 VALUES(p_firm,i.student_id,i.application_id,'application',i.application_id,i.id,'Next step: '||i.title,
 'Open the decision and enrollment workspace and record the outcome. Completing this task does not confirm enrollment, payment, or delivery.',
 'follow_up','pending','medium',CASE WHEN i.family_shared THEN 'family' ELSE 'student' END,p_owner,owner,false,p_due,'simple',p_actor,p_actor) RETURNING id INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.task_notice_allowed(p_task uuid,p_user uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=public AS $$
BEGIN
 RETURN EXISTS (
  SELECT 1 FROM tasks t JOIN firm_memberships m ON m.firm_id=t.firm_id AND m.user_id=p_user AND m.status='active' JOIN users u ON u.id=p_user
  WHERE t.id=p_task AND t.archived_at IS NULL AND NOT t.owner_pending AND u.auth_provider_user_id NOT LIKE 'invited_%' AND u.auth_provider_user_id NOT LIKE 'pending_%'
   AND p_user IN (t.assigned_user_id,t.reviewer_user_id)
   AND (t.follow_through_item_id IS NULL OR EXISTS(SELECT 1 FROM application_follow_through_items i JOIN applications a ON a.id=i.application_id AND a.firm_id=i.firm_id WHERE i.id=t.follow_through_item_id AND i.firm_id=t.firm_id AND i.student_id=t.student_id AND a.stage IN ('submitted','under_review','decision_received') AND (m.role<>'parent_guardian' OR i.family_shared)))
   AND (t.application_next_step_id IS NULL OR EXISTS(SELECT 1 FROM application_next_steps s WHERE s.id=t.application_next_step_id AND s.firm_id=t.firm_id AND s.student_id=t.student_id AND public.next_step_current(s.application_id,s.decision_revision,s.kind) AND (m.role<>'parent_guardian' OR s.family_shared)))
   AND (m.role IN ('firm_owner','firm_admin','read_only_staff') OR
    (m.role IN ('counselor','essay_coach','tutor') AND (t.student_id IS NULL OR EXISTS(SELECT 1 FROM student_staff_assignments a WHERE a.firm_id=t.firm_id AND a.student_id=t.student_id AND a.user_id=p_user))) OR
    (m.role='student' AND t.visibility_scope IN ('student','family') AND EXISTS(SELECT 1 FROM students s WHERE s.id=t.student_id AND s.firm_id=t.firm_id AND s.user_id=p_user)) OR
    (m.role='parent_guardian' AND t.visibility_scope='family' AND EXISTS(SELECT 1 FROM students s JOIN family_members f ON f.family_id=s.family_id AND f.firm_id=s.firm_id WHERE s.id=t.student_id AND s.firm_id=t.firm_id AND f.user_id=p_user)))
 );
END $$;

-- Keep post-decision letters out of the original submission packet and readiness projection.
ALTER TABLE essay_drafts ADD COLUMN application_phase text NOT NULL DEFAULT 'application' CHECK(application_phase IN ('application','post_decision'));
CREATE FUNCTION public.guard_essay_application_phase() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.application_phase IS DISTINCT FROM OLD.application_phase THEN RAISE EXCEPTION 'Writing phase cannot change'; END IF;
 IF TG_OP='UPDATE' AND OLD.application_phase='post_decision' AND ROW(NEW.firm_id,NEW.student_id,NEW.application_id,NEW.student_college_id) IS DISTINCT FROM ROW(OLD.firm_id,OLD.student_id,OLD.application_id,OLD.student_college_id) THEN RAISE EXCEPTION 'This letter stays connected to its decision workspace'; END IF;
 IF NEW.application_phase='post_decision' AND (NEW.application_id IS NULL OR NEW.library_prompt_id IS NOT NULL OR NEW.library_prompt_slot IS NOT NULL) THEN RAISE EXCEPTION 'Post-decision writing belongs to an application without an application prompt'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_essay_application_phase BEFORE INSERT OR UPDATE ON essay_drafts FOR EACH ROW EXECUTE FUNCTION public.guard_essay_application_phase();
REVOKE ALL ON FUNCTION public.guard_essay_application_phase() FROM PUBLIC,anon;

-- A letter is an ordinary student-visible draft: existing versioning, review and parent controls apply.
CREATE FUNCTION public.create_decision_letter(p_firm uuid,p_actor uuid,p_step uuid,p_revision integer) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s application_next_steps;a applications;r text;e uuid;
BEGIN
 SELECT * INTO s FROM application_next_steps WHERE id=p_step AND firm_id=p_firm FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'Next step not found'; END IF;
 r:=public.work_actor(p_firm,p_actor,s.student_id);
 IF r NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Ask your counselor to create the letter draft'; END IF;
 IF s.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Next step changed. Refresh before saving.'; END IF;
 IF s.kind NOT IN ('waitlist','deferral') OR NOT public.next_step_current(s.application_id,s.decision_revision,s.kind) THEN RAISE EXCEPTION 'Review this step against the current decision before creating a letter'; END IF;
 IF s.essay_id IS NOT NULL THEN RETURN s.essay_id; END IF;
 SELECT * INTO a FROM applications WHERE id=s.application_id AND firm_id=p_firm;
 INSERT INTO essay_drafts(firm_id,student_id,student_college_id,application_id,title,essay_type,body,status,visibility_scope,current_version_number,created_by_user_id,updated_by_user_id,application_phase)
 VALUES(p_firm,s.student_id,a.student_college_id,a.id,CASE s.kind WHEN 'waitlist' THEN 'Letter of continued interest' ELSE 'Deferral update letter' END,'other','','draft','student',1,p_actor,p_actor,'post_decision') RETURNING id INTO e;
 INSERT INTO essay_draft_versions(essay_draft_id,version_number,body,created_by_user_id) VALUES(e,1,'',p_actor);
 UPDATE application_next_steps SET essay_id=e,revision=revision+1,updated_by_user_id=p_actor WHERE id=s.id AND firm_id=p_firm;
 RETURN e;
END $$;
REVOKE ALL ON FUNCTION public.next_step_current(uuid,integer,text),public.guard_decision_event(),public.guard_decision_projection(),public.record_application_decision(uuid,uuid,uuid,integer,text,date,text,boolean),public.guard_application_next_step(),public.guard_next_step_task(),public.sync_next_step_tasks(),public.schedule_application_next_step(uuid,uuid,uuid,integer,uuid,date,uuid,bigint),public.create_decision_letter(uuid,uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.next_step_current(uuid,integer,text),public.record_application_decision(uuid,uuid,uuid,integer,text,date,text,boolean),public.schedule_application_next_step(uuid,uuid,uuid,integer,uuid,date,uuid,bigint),public.create_decision_letter(uuid,uuid,uuid,integer) TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON application_decision_events,application_next_steps TO authenticated,service_role;

CREATE FUNCTION public.initialize_decision_checklist(p_firm uuid,p_actor uuid,p_application uuid,p_revision integer) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a applications;r text;k text;entry record;
BEGIN
 SELECT * INTO a FROM applications WHERE id=p_application AND firm_id=p_firm FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
 r:=public.work_actor(p_firm,p_actor,a.student_id);
 IF r NOT IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Next-step editing access required'; END IF;
 IF a.decision_revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Decision changed. Refresh before saving.'; END IF;
 k:=CASE a.decision_result WHEN 'accepted' THEN 'enrollment' WHEN 'waitlisted' THEN 'waitlist' WHEN 'deferred' THEN 'deferral' END;
 IF k IS NULL OR NOT public.next_step_current(a.id,a.decision_revision,k) THEN RAISE EXCEPTION 'Review the current decision before adding a checklist'; END IF;
 FOR entry IN SELECT * FROM (VALUES
  ('enrollment','deposit','Confirm enrollment choice and deposit'),('enrollment','housing','Check housing requirements'),('enrollment','transcript','Arrange final transcript'),('enrollment','orientation','Check orientation and remaining requirements'),
  ('waitlist','response','Confirm waitlist response and deadline'),('waitlist','letter','Plan a letter of continued interest'),('waitlist','updates','Check requested updates and materials'),
  ('deferral','response','Confirm deferral instructions and deadline'),('deferral','letter','Plan a deferral update letter'),('deferral','updates','Check midyear grades and required updates')) AS defaults(kind,key,title) WHERE kind=k
 LOOP
  INSERT INTO application_next_steps(firm_id,student_id,application_id,decision_revision,kind,template_key,title,created_by_user_id,updated_by_user_id)
  VALUES(p_firm,a.student_id,a.id,a.decision_revision,k,entry.key,entry.title,p_actor,p_actor)
  ON CONFLICT(firm_id,application_id,decision_revision,template_key) WHERE template_key IS NOT NULL DO NOTHING;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.initialize_decision_checklist(uuid,uuid,uuid,integer),public.apply_decision_event() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.initialize_decision_checklist(uuid,uuid,uuid,integer) TO authenticated,service_role;

-- Preserve the original packet fingerprint when later letters are drafted.
CREATE OR REPLACE FUNCTION public.application_review_preview(p_firm uuid,p_actor uuid,p_application uuid,p_general uuid[] DEFAULT '{}')
-- VOLATILE deliberately takes fresh read snapshots after source row locks wait.
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=public AS $$
DECLARE a applications; r text; e record; ps college_prompt_sets; lp record; manifest jsonb; essays jsonb:='[]'::jsonb;
 blockers jsonb:='[]'::jsonb; warnings jsonb:='[]'::jsonb; working jsonb:='[]'::jsonb; tasks_state jsonb; prompts_state jsonb;
 ids uuid[]:='{}'::uuid[]; words integer; characters integer; school text; entry integer; sc integer; general_ids uuid[];
BEGIN
 SELECT * INTO a FROM applications WHERE id=p_application AND firm_id=p_firm;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
 r:=public.work_actor(p_firm,p_actor,a.student_id);
 IF r='parent_guardian' THEN RAISE EXCEPTION 'Final review is managed by the student and counseling team'; END IF;
 SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}') INTO general_ids FROM unnest(p_general) x;
 IF p_general IS NULL OR cardinality(p_general)>20 OR cardinality(general_ids)<>cardinality(p_general) THEN RAISE EXCEPTION 'Choose each general essay once'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(general_ids) g WHERE NOT EXISTS(SELECT 1 FROM essay_drafts d
  WHERE d.id=g AND d.firm_id=p_firm AND d.student_id=a.student_id AND d.application_id IS NULL AND d.student_college_id IS NULL AND d.visibility_scope IN ('student','family','firm')))
 THEN RAISE EXCEPTION 'Choose an available general essay for this student'; END IF;
 SELECT c.name,c.scorecard_id INTO school,sc FROM colleges c WHERE c.id=a.college_id;
 SELECT graduation_year INTO entry FROM students WHERE id=a.student_id AND firm_id=p_firm;
 SELECT * INTO ps FROM college_prompt_sets WHERE scorecard_id=sc AND entry_year=entry AND review_state='published'
  AND (firm_id IS NULL OR firm_id=p_firm) ORDER BY (firm_id IS NOT NULL) DESC,published_at DESC NULLS LAST,id LIMIT 1;
 IF ps.id IS NULL OR ps.coverage='needs_review' THEN warnings:=warnings||jsonb_build_array('Prompt coverage needs a check against the current college application.'); END IF;
 IF a.deadline_source<>'explicit' THEN warnings:=warnings||jsonb_build_array('Confirm the deadline in the college application.'); END IF;
 IF jsonb_typeof(a.checklist_json) IS DISTINCT FROM 'array' OR a.checklist_json='[]' THEN
  warnings:=warnings||jsonb_build_array('No application checklist is recorded. Verify all non-writing requirements in the college portal.');
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(a.checklist_json) c WHERE c->'done' IS DISTINCT FROM 'true'::jsonb) THEN
  blockers:=blockers||jsonb_build_array('Complete the application checklist before approving this packet.');
 END IF;
 FOR e IN SELECT d.id,d.title,d.prompt_text,d.body,d.current_version_number,d.status,d.word_count_limit,d.word_count_target,d.character_count_limit,
   d.library_prompt_id,d.library_prompt_slot,d.library_prompt_snapshot,d.application_id,d.student_college_id,
   v.id AS version_id,v.body AS saved_body
  FROM essay_drafts d LEFT JOIN essay_draft_versions v ON v.essay_draft_id=d.id AND v.version_number=d.current_version_number
  WHERE d.firm_id=p_firm AND d.student_id=a.student_id AND d.application_phase='application' AND d.visibility_scope IN ('student','family','firm')
   AND (d.application_id=a.id OR (d.application_id IS NULL AND d.student_college_id=a.student_college_id) OR d.id=ANY(general_ids)) ORDER BY d.id
 LOOP
  ids:=array_append(ids,e.id);
  words:=CASE WHEN btrim(coalesce(e.saved_body,''))='' THEN 0 ELSE cardinality(regexp_split_to_array(btrim(e.saved_body),'\s+')) END;
  characters:=length(coalesce(e.saved_body,''));
  IF e.version_id IS NULL OR coalesce(e.saved_body,'') IS DISTINCT FROM coalesce(e.body,'') THEN blockers:=blockers||jsonb_build_array(coalesce(e.title,'Untitled response')||': save the current writing as a version.'); END IF;
  IF words=0 THEN blockers:=blockers||jsonb_build_array(coalesce(e.title,'Untitled response')||': the saved response is empty.'); END IF;
  IF (coalesce(e.word_count_limit,e.word_count_target) IS NOT NULL AND words>coalesce(e.word_count_limit,e.word_count_target))
   OR (e.character_count_limit IS NOT NULL AND characters>e.character_count_limit) THEN
   blockers:=blockers||jsonb_build_array(coalesce(e.title,'Untitled response')||': the saved response exceeds its limit.'); END IF;
  IF e.status='revision_requested' THEN blockers:=blockers||jsonb_build_array(coalesce(e.title,'Untitled response')||': resolve the requested revision and resubmit for review.'); END IF;
  SELECT p.* INTO lp FROM college_library_prompts p WHERE p.prompt_set_id=ps.id
   AND (p.id=e.library_prompt_id OR (sc::text||':'||entry::text||':'||p.prompt_key)=e.library_prompt_slot) LIMIT 1;
  IF lp.id IS NOT NULL AND lp.id IS DISTINCT FROM e.library_prompt_id THEN
   warnings:=warnings||jsonb_build_array(coalesce(e.title,'Untitled response')||': published requirements changed; check the assigned question against the current application.');
   IF (lp.word_limit IS NOT NULL AND words>lp.word_limit) OR (lp.character_limit IS NOT NULL AND characters>lp.character_limit) THEN
    blockers:=blockers||jsonb_build_array(coalesce(e.title,'Untitled response')||': the saved response exceeds the current published limit.'); END IF;
  END IF;
  essays:=essays||jsonb_build_array(jsonb_build_object('id',e.id,'title',coalesce(e.title,'Untitled response'),'prompt',coalesce(e.prompt_text,''),'body',coalesce(e.saved_body,''),
   'versionId',e.version_id,'version',e.current_version_number,'wordLimit',coalesce(e.word_count_limit,e.word_count_target),'characterLimit',e.character_count_limit,
   'words',words,'characters',characters,'general',e.id=ANY(general_ids)));
  working:=working||jsonb_build_array(jsonb_build_object('id',e.id,'body',e.body,'status',e.status,'prompt',e.library_prompt_snapshot,'slot',e.library_prompt_slot,'promptId',e.library_prompt_id));
 END LOOP;
 IF cardinality(ids)>200 THEN RAISE EXCEPTION 'Too many responses for one application packet'; END IF;
 IF ps.coverage='verified' AND EXISTS(SELECT 1 FROM college_library_prompts p WHERE p.prompt_set_id=ps.id AND p.requirement='required' AND NOT EXISTS(
  SELECT 1 FROM essay_drafts d WHERE d.firm_id=p_firm AND d.student_id=a.student_id AND d.id=ANY(ids)
   AND (d.library_prompt_id=p.id OR d.library_prompt_slot=(sc::text||':'||entry::text||':'||p.prompt_key)))) THEN
  blockers:=blockers||jsonb_build_array('Required college responses are missing. Review the essay planning board with your counselor.'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'status',t.status,'updated',t.updated_at) ORDER BY t.id),'[]') INTO tasks_state FROM tasks t
  WHERE t.firm_id=p_firm AND t.student_id=a.student_id AND t.archived_at IS NULL AND t.visibility_scope IN ('student','family','firm')
   AND t.essay_feedback_id IS NOT NULL AND t.related_entity_type='essay' AND t.related_entity_id=ANY(ids) AND t.status NOT IN ('completed','cancelled');
 IF tasks_state<>'[]' THEN blockers:=blockers||jsonb_build_array('Complete the open essay revision tasks before approval.'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'text',p.prompt_text,'words',p.word_limit,'characters',p.character_limit,'requirement',p.requirement) ORDER BY p.id),'[]')
  INTO prompts_state FROM college_library_prompts p WHERE p.prompt_set_id=ps.id;
 manifest:=jsonb_build_object('college',coalesce(school,'College'),'round',a.application_type,'deadline',a.deadline_at,'generalEssayIds',to_jsonb(general_ids),'essays',essays);
 RETURN jsonb_build_object('manifest',manifest,'blockers',blockers,'warnings',warnings,'fingerprint',
  md5(jsonb_build_object('manifest',manifest,'working',working,'checklist',a.checklist_json,'year',entry,'set',ps.id,'coverage',ps.coverage,
    'prompts',prompts_state,'tasks',tasks_state,'deadlineSource',a.deadline_source,'blockers',blockers,'warnings',warnings)::text));
END $$;
