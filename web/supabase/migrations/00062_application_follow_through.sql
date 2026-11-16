-- Post-submission records are separate from the immutable submission packet.
-- Deliberate audience: student + assigned team; only the student grants parents access.
CREATE TABLE application_follow_through_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), firm_id uuid NOT NULL REFERENCES firms(id),
 student_id uuid NOT NULL REFERENCES students(id), application_id uuid NOT NULL REFERENCES applications(id),
 kind text NOT NULL CHECK(kind IN ('receipt','portal','material')),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160), status text NOT NULL,
 sent_on date, received_on date, checked_on date, portal_url text NOT NULL DEFAULT '',
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=4000), evidence_document_id uuid REFERENCES documents(id),
 family_shared boolean NOT NULL DEFAULT false, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by_user_id uuid NOT NULL REFERENCES users(id), updated_by_user_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((kind='receipt' AND status IN ('awaiting','received')) OR (kind='portal' AND status IN ('awaiting','active')) OR
   (kind='material' AND status IN ('needed','requested','sent','received','waived'))),
 CHECK ((status='received')=(received_on IS NOT NULL)), CHECK(status<>'sent' OR sent_on IS NOT NULL),
 CHECK(kind='material' OR sent_on IS NULL), CHECK(sent_on IS NULL OR received_on IS NULL OR received_on>=sent_on),
 CHECK(length(portal_url)<=2000 AND (portal_url='' OR (kind='portal' AND portal_url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$')))
);
CREATE UNIQUE INDEX follow_through_singleton ON application_follow_through_items(firm_id,application_id,kind) WHERE kind IN ('receipt','portal');
CREATE INDEX follow_through_student ON application_follow_through_items(firm_id,student_id,application_id);
CREATE INDEX follow_through_document ON application_follow_through_items(evidence_document_id) WHERE evidence_document_id IS NOT NULL;
ALTER TABLE application_follow_through_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY follow_through_read ON application_follow_through_items FOR SELECT TO authenticated USING (
 public.interview_can_access(firm_id,student_id) AND (public.current_member_role()<>'parent_guardian' OR family_shared));
CREATE POLICY follow_through_insert ON application_follow_through_items FOR INSERT TO authenticated WITH CHECK(public.interview_can_write_bank(firm_id,student_id));
CREATE POLICY follow_through_update ON application_follow_through_items FOR UPDATE TO authenticated USING(public.interview_can_write_bank(firm_id,student_id)) WITH CHECK(public.interview_can_write_bank(firm_id,student_id));

CREATE FUNCTION public.guard_application_follow_through() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a applications; r text; today date; changed boolean;
BEGIN
 SELECT * INTO a FROM applications WHERE id=NEW.application_id AND firm_id=NEW.firm_id AND student_id=NEW.student_id FOR SHARE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
 r:=public.work_actor(NEW.firm_id,NEW.updated_by_user_id,NEW.student_id);
 IF r NOT IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Tracking editing access required'; END IF;
 IF a.stage NOT IN ('submitted','under_review','decision_received') AND NOT (TG_OP='UPDATE' AND NOT NEW.family_shared AND OLD.family_shared AND (to_jsonb(NEW)-ARRAY['revision','updated_by_user_id','updated_at','family_shared']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','updated_by_user_id','updated_at','family_shared'])) THEN RAISE EXCEPTION 'Record submission before tracking follow-through'; END IF;
 SELECT (now() AT TIME ZONE coalesce(timezone,'America/New_York'))::date INTO today FROM firms WHERE id=NEW.firm_id;
 IF greatest(NEW.sent_on,NEW.received_on,NEW.checked_on)>today THEN RAISE EXCEPTION 'Tracking dates cannot be in the future'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.created_by_user_id IS DISTINCT FROM NEW.updated_by_user_id OR NEW.revision<>1 OR NEW.family_shared THEN RAISE EXCEPTION 'New tracking starts with student and team access'; END IF;
  NEW.created_at:=now();
 ELSE
  IF ROW(NEW.id,NEW.firm_id,NEW.student_id,NEW.application_id,NEW.kind,NEW.created_by_user_id,NEW.created_at) IS DISTINCT FROM
    ROW(OLD.id,OLD.firm_id,OLD.student_id,OLD.application_id,OLD.kind,OLD.created_by_user_id,OLD.created_at) THEN RAISE EXCEPTION 'Tracking identity cannot change'; END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Tracking changed in another window. Refresh before saving.'; END IF;
  changed:=(to_jsonb(NEW)-ARRAY['revision','updated_by_user_id','updated_at','family_shared']) IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['revision','updated_by_user_id','updated_at','family_shared']);
  IF changed THEN NEW.family_shared:=false;
  ELSIF NEW.family_shared IS DISTINCT FROM OLD.family_shared AND r<>'student' THEN RAISE EXCEPTION 'Only the student can change parent sharing'; END IF;
 END IF;
 -- Existing attachments keep independent download permissions. Linking never changes them.
 IF NEW.evidence_document_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.evidence_document_id IS DISTINCT FROM OLD.evidence_document_id) AND NOT EXISTS (
  SELECT 1 FROM documents d WHERE d.id=NEW.evidence_document_id AND d.firm_id=NEW.firm_id AND d.student_id=NEW.student_id AND d.archived_at IS NULL AND d.visibility_scope IN ('student','family','firm'))
 THEN RAISE EXCEPTION 'Choose a document shared with this student'; END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER guard_application_follow_through BEFORE INSERT OR UPDATE ON application_follow_through_items FOR EACH ROW EXECUTE FUNCTION public.guard_application_follow_through();

ALTER TABLE tasks ADD COLUMN follow_through_item_id uuid REFERENCES application_follow_through_items(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX follow_through_open_task ON tasks(firm_id,follow_through_item_id) WHERE follow_through_item_id IS NOT NULL AND archived_at IS NULL AND status NOT IN ('completed','cancelled');
CREATE INDEX follow_through_task_source ON tasks(follow_through_item_id) WHERE follow_through_item_id IS NOT NULL;
CREATE POLICY tasks_follow_through_source ON tasks AS RESTRICTIVE FOR SELECT TO authenticated USING (
 follow_through_item_id IS NULL OR EXISTS(SELECT 1 FROM application_follow_through_items i WHERE i.id=follow_through_item_id AND i.firm_id=tasks.firm_id AND i.student_id=tasks.student_id));

CREATE FUNCTION public.guard_follow_through_task() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE i application_follow_through_items; r text; owner text; synced boolean:=false;
BEGIN
 IF TG_OP='UPDATE' AND OLD.follow_through_item_id IS NOT NULL AND NEW.follow_through_item_id IS DISTINCT FROM OLD.follow_through_item_id THEN RAISE EXCEPTION 'Follow-up source cannot change'; END IF;
 IF NEW.follow_through_item_id IS NULL THEN RETURN NEW; END IF;
 r:=public.work_actor(NEW.firm_id,NEW.updated_by_user_id,NEW.student_id);
 -- Parent completion never changes tracking. FOR SHARE requires UPDATE permission,
 -- which parents intentionally lack. Writers lock the source against consent races.
 IF r='parent_guardian' THEN
  SELECT * INTO i FROM application_follow_through_items WHERE id=NEW.follow_through_item_id AND firm_id=NEW.firm_id AND student_id=NEW.student_id;
 ELSE
  SELECT * INTO i FROM application_follow_through_items WHERE id=NEW.follow_through_item_id AND firm_id=NEW.firm_id AND student_id=NEW.student_id FOR SHARE;
 END IF;
 IF i.id IS NULL OR NEW.application_id IS DISTINCT FROM i.application_id OR NEW.related_entity_id IS DISTINCT FROM i.application_id OR NEW.related_entity_type IS DISTINCT FROM 'application'
  OR NEW.title IS DISTINCT FROM ('Follow up: '||i.title) OR NEW.description IS DISTINCT FROM 'Check the application follow-through panel, contact the college if needed, and record the outcome. Completing this task does not confirm receipt.'
  OR NEW.visibility_scope IS DISTINCT FROM (CASE WHEN i.family_shared THEN 'family' ELSE 'student' END)
  OR NEW.task_type<>'follow_up' OR NEW.completion_mode<>'simple' OR NEW.essay_feedback_id IS NOT NULL OR NEW.workflow_step_id IS NOT NULL OR NEW.reviewer_user_id IS NOT NULL
  OR NEW.review_feedback IS NOT NULL OR NEW.family_id IS NOT NULL OR NEW.submitted_version_id IS NOT NULL OR NEW.submitted_document_id IS NOT NULL OR NEW.due_on IS NULL OR NEW.owner_pending OR NEW.assigned_user_id IS NULL
 THEN RAISE EXCEPTION 'Follow-up tasks retain their source, instructions, audience, owner and due date'; END IF;
 r:=public.work_actor(NEW.firm_id,NEW.updated_by_user_id,NEW.student_id);
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW.firm_id,NEW.student_id,NEW.created_by_user_id) IS DISTINCT FROM ROW(OLD.id,OLD.firm_id,OLD.student_id,OLD.created_by_user_id) THEN RAISE EXCEPTION 'Follow-up identity cannot change'; END IF;
  synced:=pg_trigger_depth()>1 AND (to_jsonb(NEW)-ARRAY['title','visibility_scope','status','completed_at','updated_by_user_id','updated_at']) IS NOT DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['title','visibility_scope','status','completed_at','updated_by_user_id','updated_at']) AND
   (NEW.status=OLD.status OR (NEW.status='cancelled' AND i.kind<>'portal' AND i.status IN ('received','waived')));
 END IF;
 IF r NOT IN ('student','parent_guardian','firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Follow-up editing access required'; END IF;
 IF NOT synced THEN
  IF NEW.status NOT IN ('pending','in_progress','completed','cancelled') THEN RAISE EXCEPTION 'Follow-ups use simple task completion'; END IF;
  IF TG_OP='INSERT' AND (NEW.created_by_user_id IS DISTINCT FROM NEW.updated_by_user_id OR NEW.status<>'pending') THEN RAISE EXCEPTION 'New follow-ups start pending with the current actor'; END IF;
  IF NEW.status IN ('pending','in_progress') AND NOT EXISTS(SELECT 1 FROM applications WHERE id=i.application_id AND firm_id=i.firm_id AND stage IN ('submitted','under_review','decision_received')) THEN RAISE EXCEPTION 'Record submission before scheduling follow-through'; END IF;
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
  IF NEW.status NOT IN ('completed','cancelled') AND i.kind<>'portal' AND i.status IN ('received','waived') THEN RAISE EXCEPTION 'This tracking item is already resolved'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_follow_through_task BEFORE INSERT OR UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION public.guard_follow_through_task();

-- Synchronize derived audience in the same transaction, including service-fallback lists.
-- Receipt/waiver cancels remaining reminders; task completion never marks a material received.
CREATE FUNCTION public.sync_follow_through_tasks() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 UPDATE tasks SET title='Follow up: '||NEW.title, visibility_scope=CASE WHEN NEW.family_shared THEN 'family' ELSE 'student' END,
  status=CASE WHEN NEW.kind<>'portal' AND NEW.status IN ('received','waived') AND status NOT IN ('completed','cancelled') THEN 'cancelled' ELSE status END,
  updated_by_user_id=NEW.updated_by_user_id,updated_at=now()
 WHERE firm_id=NEW.firm_id AND student_id=NEW.student_id AND follow_through_item_id=NEW.id;
 RETURN NULL;
END $$;
CREATE TRIGGER sync_follow_through_tasks AFTER UPDATE ON application_follow_through_items FOR EACH ROW EXECUTE FUNCTION public.sync_follow_through_tasks();

CREATE FUNCTION public.create_application_follow_up(p_firm uuid,p_actor uuid,p_item uuid,p_revision integer,p_owner uuid,p_due date,p_task uuid DEFAULT NULL,p_expected bigint DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE i application_follow_through_items; r text; owner text; existing tasks; result uuid;
BEGIN
 SELECT * INTO i FROM application_follow_through_items WHERE id=p_item AND firm_id=p_firm FOR UPDATE;
 IF i.id IS NULL THEN RAISE EXCEPTION 'Tracking item not found'; END IF;
 r:=public.work_actor(p_firm,p_actor,i.student_id);
 IF r NOT IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor') OR (r='student' AND p_actor IS DISTINCT FROM p_owner) THEN RAISE EXCEPTION 'Follow-up editing access required'; END IF;
 IF i.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Tracking changed in another window. Refresh before saving.'; END IF;
 IF p_due IS NULL THEN RAISE EXCEPTION 'Choose a follow-up due date'; END IF;
 IF p_task IS NOT NULL THEN
  SELECT * INTO existing FROM tasks WHERE id=p_task AND firm_id=p_firm AND follow_through_item_id=i.id AND archived_at IS NULL FOR UPDATE;
  IF existing.id IS NULL OR existing.status IN ('completed','cancelled') OR existing.notice_revision IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Follow-up changed in another window. Refresh before saving.'; END IF;
  SELECT role INTO owner FROM firm_memberships WHERE firm_id=p_firm AND user_id=p_owner AND status='active';
  UPDATE tasks SET assigned_user_id=p_owner,owner_role=owner,due_on=p_due,updated_by_user_id=p_actor WHERE id=p_task AND firm_id=p_firm;
  RETURN p_task;
 END IF;
 SELECT * INTO existing FROM tasks WHERE firm_id=p_firm AND follow_through_item_id=i.id AND archived_at IS NULL AND status NOT IN ('completed','cancelled');
 IF existing.id IS NOT NULL THEN
  IF existing.assigned_user_id=p_owner AND existing.due_on=p_due THEN RETURN existing.id; END IF;
  RAISE EXCEPTION 'An open follow-up already exists. Refresh to manage it.';
 END IF;
 SELECT role INTO owner FROM firm_memberships WHERE firm_id=p_firm AND user_id=p_owner AND status='active';
 INSERT INTO tasks(firm_id,student_id,application_id,related_entity_type,related_entity_id,follow_through_item_id,title,description,task_type,status,priority,visibility_scope,assigned_user_id,owner_role,owner_pending,due_on,completion_mode,created_by_user_id,updated_by_user_id)
 VALUES(p_firm,i.student_id,i.application_id,'application',i.application_id,i.id,'Follow up: '||i.title,
 'Check the application follow-through panel, contact the college if needed, and record the outcome. Completing this task does not confirm receipt.',
 'follow_up','pending','medium',CASE WHEN i.family_shared THEN 'family' ELSE 'student' END,p_owner,owner,false,p_due,'simple',p_actor,p_actor) RETURNING id INTO result;
 RETURN result;
END $$;

-- Delivery independently rechecks the recipient's current consent, even under service role.
CREATE OR REPLACE FUNCTION public.task_notice_allowed(p_task uuid,p_user uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=public AS $$
BEGIN
 RETURN EXISTS (
  SELECT 1 FROM tasks t JOIN firm_memberships m ON m.firm_id=t.firm_id AND m.user_id=p_user AND m.status='active' JOIN users u ON u.id=p_user
  WHERE t.id=p_task AND t.archived_at IS NULL AND NOT t.owner_pending AND u.auth_provider_user_id NOT LIKE 'invited_%' AND u.auth_provider_user_id NOT LIKE 'pending_%'
   AND p_user IN (t.assigned_user_id,t.reviewer_user_id)
   AND (t.follow_through_item_id IS NULL OR EXISTS(SELECT 1 FROM application_follow_through_items i JOIN applications a ON a.id=i.application_id AND a.firm_id=i.firm_id WHERE i.id=t.follow_through_item_id AND i.firm_id=t.firm_id AND i.student_id=t.student_id AND a.stage IN ('submitted','under_review','decision_received') AND (m.role<>'parent_guardian' OR i.family_shared)))
   AND (m.role IN ('firm_owner','firm_admin','read_only_staff') OR
    (m.role IN ('counselor','essay_coach','tutor') AND (t.student_id IS NULL OR EXISTS(SELECT 1 FROM student_staff_assignments a WHERE a.firm_id=t.firm_id AND a.student_id=t.student_id AND a.user_id=p_user))) OR
    (m.role='student' AND t.visibility_scope IN ('student','family') AND EXISTS(SELECT 1 FROM students s WHERE s.id=t.student_id AND s.firm_id=t.firm_id AND s.user_id=p_user)) OR
    (m.role='parent_guardian' AND t.visibility_scope='family' AND EXISTS(SELECT 1 FROM students s JOIN family_members f ON f.family_id=s.family_id AND f.firm_id=s.firm_id WHERE s.id=t.student_id AND s.firm_id=t.firm_id AND f.user_id=p_user)))
 );
END $$;
REVOKE ALL ON FUNCTION public.guard_application_follow_through(),public.guard_follow_through_task(),public.sync_follow_through_tasks(),public.create_application_follow_up(uuid,uuid,uuid,integer,uuid,date,uuid,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_application_follow_up(uuid,uuid,uuid,integer,uuid,date,uuid,bigint) TO authenticated,service_role;
