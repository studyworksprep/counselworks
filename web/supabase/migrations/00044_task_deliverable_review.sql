-- Phase C: existing artifacts remain the source of truth; no legacy backfill.
ALTER TABLE tasks ADD COLUMN completion_mode text NOT NULL DEFAULT 'simple'
  CHECK (completion_mode IN ('simple', 'evidence', 'review_required'));
ALTER TABLE tasks ADD COLUMN reviewer_user_id uuid REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN submitted_version_id uuid REFERENCES essay_draft_versions(id);
ALTER TABLE tasks ADD COLUMN submitted_document_id uuid REFERENCES documents(id);
ALTER TABLE tasks ADD COLUMN review_feedback text;
ALTER TABLE tasks ADD COLUMN dependency_blocked boolean NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN needs_attention boolean NOT NULL DEFAULT false;
-- One acceptance decision per essay. Simple reference tasks may still share a link.
CREATE UNIQUE INDEX tasks_one_essay_deliverable ON tasks(firm_id,related_entity_id)
  WHERE related_entity_type='essay' AND completion_mode<>'simple' AND archived_at IS NULL;
ALTER TABLE essay_drafts ADD COLUMN submitted_version_id uuid REFERENCES essay_draft_versions(id);
ALTER TABLE workflow_template_steps ADD COLUMN completion_mode text NOT NULL DEFAULT 'simple'
  CHECK (completion_mode IN ('simple', 'evidence', 'review_required'));

-- All functions are invokers: existing RLS remains in force, including for RPCs.
-- Validate actor arguments for user-scoped clients; the service fallback/jobs
-- still have to name an active member with the correct student relationship.
CREATE FUNCTION public.work_actor(p_firm uuid, p_actor uuid, p_student uuid)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r text;
BEGIN
  IF current_user NOT IN ('postgres','service_role') AND
     (public.current_user_id() IS DISTINCT FROM p_actor OR public.firm_id() IS DISTINCT FROM p_firm)
  THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT role INTO r FROM firm_memberships WHERE firm_id=p_firm AND user_id=p_actor AND status='active';
  IF r IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_student IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM students WHERE id=p_student AND firm_id=p_firm) THEN RAISE EXCEPTION 'Student not found'; END IF;
    IF r IN ('firm_owner','firm_admin','read_only_staff') THEN RETURN r; END IF;
    IF r IN ('counselor','essay_coach','tutor') AND EXISTS
      (SELECT 1 FROM student_staff_assignments WHERE firm_id=p_firm AND student_id=p_student AND user_id=p_actor) THEN RETURN r; END IF;
    IF r='student' AND EXISTS (SELECT 1 FROM students WHERE firm_id=p_firm AND id=p_student AND user_id=p_actor) THEN RETURN r; END IF;
    IF r='parent_guardian' AND EXISTS (SELECT 1 FROM students s JOIN family_members f ON f.family_id=s.family_id
      WHERE s.id=p_student AND s.firm_id=p_firm AND f.firm_id=p_firm AND f.user_id=p_actor) THEN RETURN r; END IF;
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF r IN ('student','parent_guardian') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN r;
END $$;

-- Reconcile task and step in the same transaction as the task write. On reopen,
-- propagate blocking transitively; started work is retained and flagged.
CREATE FUNCTION public.sync_task_step() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE w uuid; s uuid; d record; total integer; done integer;
BEGIN
  SELECT sw.id, st.id INTO w,s FROM student_workflow_steps st JOIN student_workflows sw ON sw.id=st.student_workflow_id
    WHERE st.linked_task_id=NEW.id AND sw.firm_id=NEW.firm_id;
  IF w IS NULL THEN RETURN NEW; END IF;
  PERFORM 1 FROM student_workflows WHERE id=w AND firm_id=NEW.firm_id FOR UPDATE;
  UPDATE student_workflow_steps SET status=CASE WHEN NEW.status='completed' THEN 'completed'
      WHEN NEW.dependency_blocked THEN 'blocked' WHEN NEW.status='pending' THEN 'pending' ELSE 'in_progress' END,
    completed_at=NEW.completed_at, completed_by_user_id=CASE WHEN NEW.status='completed' THEN NEW.updated_by_user_id ELSE NULL END
    WHERE id=s;
  IF OLD.status='completed' AND NEW.status<>'completed' THEN
    FOR d IN WITH RECURSIVE affected AS (
      SELECT st.id, st.template_step_id, st.linked_task_id FROM student_workflow_steps st
      JOIN workflow_template_steps ts ON ts.id=st.template_step_id
      WHERE st.student_workflow_id=w AND ts.depends_on_step_id=(SELECT template_step_id FROM student_workflow_steps WHERE id=s)
      UNION
      SELECT st.id,st.template_step_id,st.linked_task_id FROM student_workflow_steps st
      JOIN workflow_template_steps ts ON ts.id=st.template_step_id JOIN affected a ON a.template_step_id=ts.depends_on_step_id
      WHERE st.student_workflow_id=w
    ) SELECT * FROM affected LOOP
      UPDATE student_workflow_steps SET status='blocked', completed_at=NULL, completed_by_user_id=NULL WHERE id=d.id;
      UPDATE tasks SET dependency_blocked=true,
        completed_at=CASE WHEN status='completed' THEN NULL ELSE completed_at END,
        status=CASE WHEN status='completed' THEN 'changes_requested' ELSE status END,
        needs_attention=needs_attention OR status<>'pending' OR submitted_version_id IS NOT NULL OR submitted_document_id IS NOT NULL
          OR (related_entity_type='essay' AND EXISTS (SELECT 1 FROM essay_drafts e WHERE e.id=tasks.related_entity_id AND e.firm_id=NEW.firm_id AND nullif(trim(e.body),'') IS NOT NULL))
          OR (related_entity_type='document_request' AND EXISTS (SELECT 1 FROM document_requests dr WHERE dr.id=tasks.related_entity_id AND dr.firm_id=NEW.firm_id AND dr.fulfilled_document_id IS NOT NULL))
        WHERE id=d.linked_task_id AND firm_id=NEW.firm_id;
    END LOOP;
  END IF;
  -- Only accepted prerequisite completion activates a step. A reopened completed
  -- descendant stays flagged until staff explicitly reopens/reviews its work.
  UPDATE student_workflow_steps st SET status='pending' FROM workflow_template_steps ts
    WHERE st.student_workflow_id=w AND st.template_step_id=ts.id AND st.status='blocked'
    AND (ts.depends_on_step_id IS NULL OR EXISTS (SELECT 1 FROM student_workflow_steps p
      WHERE p.student_workflow_id=w AND p.template_step_id=ts.depends_on_step_id AND p.status='completed'));
  UPDATE tasks t SET dependency_blocked=false FROM student_workflow_steps st
    WHERE st.student_workflow_id=w AND st.linked_task_id=t.id AND st.status='pending' AND t.firm_id=NEW.firm_id AND t.dependency_blocked;
  SELECT count(*),count(*) FILTER (WHERE status IN ('completed','skipped')) INTO total,done FROM student_workflow_steps WHERE student_workflow_id=w;
  UPDATE student_workflows SET status=CASE WHEN total>0 AND total=done THEN 'completed' ELSE 'in_progress' END,
    completed_at=CASE WHEN total>0 AND total=done THEN now() ELSE NULL END, started_at=coalesce(started_at,now())
    WHERE id=w AND firm_id=NEW.firm_id;
  RETURN NEW;
END $$;
CREATE TRIGGER task_step_transition AFTER UPDATE OF status ON tasks FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.sync_task_step();

-- A row lock covers both task insertion and storing the pointer: concurrent
-- interactive/nightly retries return the same task and cannot leave an orphan.
CREATE FUNCTION public.materialize_workflow_task(p_step uuid,p_firm uuid,p_actor uuid,p_owner uuid,p_role text,p_ready boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE st student_workflow_steps; sw student_workflows; ts workflow_template_steps; result uuid;
BEGIN
  SELECT * INTO st FROM student_workflow_steps WHERE id=p_step FOR UPDATE;
  SELECT * INTO sw FROM student_workflows WHERE id=st.student_workflow_id AND firm_id=p_firm;
  IF sw.id IS NULL THEN RAISE EXCEPTION 'Step not found'; END IF;
  PERFORM public.work_actor(p_firm,p_actor,sw.student_id);
  IF st.linked_task_id IS NOT NULL THEN RETURN st.linked_task_id; END IF;
  IF p_ready AND (p_owner IS NULL OR NOT EXISTS (SELECT 1 FROM firm_memberships m JOIN users u ON u.id=m.user_id
    WHERE m.firm_id=p_firm AND m.user_id=p_owner AND m.status='active'
    AND u.auth_provider_user_id NOT LIKE 'invited_%' AND u.auth_provider_user_id NOT LIKE 'pending_%')) THEN RAISE EXCEPTION 'Owner is not ready'; END IF;
  IF st.assigned_user_id IS NOT NULL AND p_owner IS DISTINCT FROM st.assigned_user_id THEN RAISE EXCEPTION 'Owner changed. Retry materialization'; END IF;
  IF p_owner IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM firm_memberships m WHERE m.firm_id=p_firm AND m.user_id=p_owner AND m.status='active' AND (
      m.role IN ('firm_owner','firm_admin','read_only_staff') OR
      (m.role IN ('counselor','essay_coach','tutor') AND EXISTS (SELECT 1 FROM student_staff_assignments a WHERE a.firm_id=p_firm AND a.student_id=sw.student_id AND a.user_id=p_owner)) OR
      (m.role='student' AND EXISTS (SELECT 1 FROM students s WHERE s.id=sw.student_id AND s.firm_id=p_firm AND s.user_id=p_owner)) OR
      (m.role='parent_guardian' AND EXISTS (SELECT 1 FROM students s JOIN family_members f ON s.family_id=f.family_id WHERE s.id=sw.student_id AND s.firm_id=p_firm AND f.firm_id=p_firm AND f.user_id=p_owner))
    )) AND NOT (NOT p_ready AND EXISTS (SELECT 1 FROM family_members fm JOIN students eligible_student ON eligible_student.family_id=fm.family_id JOIN users u ON u.id=fm.user_id WHERE eligible_student.id=sw.student_id AND eligible_student.firm_id=p_firm AND fm.firm_id=p_firm AND fm.user_id=p_owner AND (u.auth_provider_user_id LIKE 'invited_%' OR u.auth_provider_user_id LIKE 'pending_%'))) THEN RAISE EXCEPTION 'Owner not eligible'; END IF;
  IF st.status NOT IN ('pending','in_progress') THEN RETURN NULL; END IF;
  SELECT * INTO ts FROM workflow_template_steps WHERE id=st.template_step_id;
  IF ts.depends_on_step_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM student_workflow_steps
    WHERE student_workflow_id=sw.id AND template_step_id=ts.depends_on_step_id AND status='completed') THEN RETURN NULL; END IF;
  INSERT INTO tasks(firm_id,title,description,task_type,status,priority,visibility_scope,assigned_user_id,
    owner_role,owner_pending,student_id,due_at,created_by_user_id,updated_by_user_id,completion_mode,reviewer_user_id)
  VALUES(p_firm,coalesce(st.title,ts.name),coalesce(st.description,ts.description),coalesce(ts.task_type,'workflow_step'),
    'pending','medium',ts.visibility_scope,p_owner,p_role,NOT p_ready,sw.student_id,st.due_date::timestamptz,
    coalesce(sw.created_by_user_id,p_actor),p_actor,ts.completion_mode,
    CASE WHEN ts.completion_mode='review_required' THEN sw.created_by_user_id END)
  RETURNING id INTO result;
  UPDATE student_workflow_steps SET linked_task_id=result WHERE id=p_step;
  RETURN result;
END $$;

-- Atomic essay save + immutable version snapshot. Autosaves do not mint versions;
-- submissions always do, so the submitted body can never drift under review.
CREATE FUNCTION public.write_essay(p_firm uuid,p_actor uuid,p_essay uuid,p_action text,
  p_body text DEFAULT NULL,p_expected uuid DEFAULT NULL,p_feedback text DEFAULT NULL,p_commentary text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE e essay_drafts; v essay_draft_versions; r text; vid uuid; next_version integer; t record;
BEGIN
  SELECT * INTO e FROM essay_drafts WHERE id=p_essay AND firm_id=p_firm FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Essay not found'; END IF;
  r:=public.work_actor(p_firm,p_actor,e.student_id);
  IF r='parent_guardian' OR (r='student' AND e.visibility_scope NOT IN ('student','family')) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_action IN ('save','autosave') THEN
    IF e.status IN ('approved','final') THEN RAISE EXCEPTION 'Reopen the essay before editing'; END IF;
    next_version:=e.current_version_number+CASE WHEN p_action='save' THEN 1 ELSE 0 END;
    IF p_action='save' THEN
      INSERT INTO essay_draft_versions(essay_draft_id,version_number,body,commentary,created_by_user_id)
        VALUES(e.id,next_version,p_body,p_commentary,p_actor);
    END IF;
    UPDATE essay_drafts SET body=p_body,current_version_number=next_version,
      status=CASE WHEN status='in_review' AND (body IS DISTINCT FROM p_body OR p_action='save') THEN 'revision_requested' ELSE status END,
      updated_by_user_id=p_actor WHERE id=e.id AND firm_id=p_firm;
    IF e.body IS DISTINCT FROM p_body THEN
      UPDATE tasks SET status='in_progress',updated_by_user_id=p_actor WHERE firm_id=p_firm AND related_entity_type='essay' AND related_entity_id=e.id
        AND completion_mode<>'simple' AND status='pending' AND NOT owner_pending AND NOT dependency_blocked AND NOT needs_attention
        AND (r<>'student' OR assigned_user_id=p_actor) AND archived_at IS NULL;
    END IF;
    IF e.status='in_review' AND (e.body IS DISTINCT FROM p_body OR p_action='save') THEN
      UPDATE tasks SET status='changes_requested',review_feedback='The draft changed after submission. Submit the revised version.',updated_by_user_id=p_actor
        WHERE firm_id=p_firm AND related_entity_type='essay' AND related_entity_id=e.id AND completion_mode<>'simple' AND status='submitted';
    END IF;
  ELSIF p_action='submit' THEN
    IF e.status IN ('approved','final') THEN RAISE EXCEPTION 'Reopen the essay before submitting'; END IF;
    IF r='student' AND EXISTS (SELECT 1 FROM tasks WHERE firm_id=p_firm AND related_entity_type='essay' AND related_entity_id=e.id AND completion_mode<>'simple' AND archived_at IS NULL AND assigned_user_id IS DISTINCT FROM p_actor) THEN RAISE EXCEPTION 'Only the task owner may submit this essay'; END IF;
    IF nullif(trim(e.body),'') IS NULL THEN RAISE EXCEPTION 'Write the essay before submitting'; END IF;
    IF EXISTS (SELECT 1 FROM tasks WHERE firm_id=p_firm AND related_entity_type='essay' AND related_entity_id=e.id
      AND completion_mode<>'simple' AND archived_at IS NULL AND (owner_pending OR dependency_blocked OR needs_attention)) THEN RAISE EXCEPTION 'Resolve blocked linked tasks before submitting'; END IF;
    IF e.status='in_review' AND e.submitted_version_id IS NOT NULL THEN RETURN jsonb_build_object('version',e.current_version_number,'submission',e.submitted_version_id); END IF;
    next_version:=e.current_version_number+1;
    INSERT INTO essay_draft_versions(essay_draft_id,version_number,body,created_by_user_id)
      VALUES(e.id,next_version,e.body,p_actor) RETURNING id INTO vid;
    UPDATE essay_drafts SET status='in_review',current_version_number=next_version,submitted_version_id=vid,updated_by_user_id=p_actor WHERE id=e.id AND firm_id=p_firm;
    UPDATE tasks SET submitted_version_id=vid,submitted_document_id=NULL,review_feedback=NULL,
      status=CASE WHEN completion_mode='evidence' THEN 'completed' ELSE 'submitted' END,
      completed_at=CASE WHEN completion_mode='evidence' THEN now() ELSE NULL END,updated_by_user_id=p_actor
      WHERE firm_id=p_firm AND related_entity_type='essay' AND related_entity_id=e.id AND completion_mode<>'simple' AND archived_at IS NULL;
  ELSIF p_action IN ('approved','final','revision_requested','draft') THEN
    IF r IN ('student','parent_guardian') THEN RAISE EXCEPTION 'Only staff may review'; END IF;
    IF p_action IN ('approved','final','revision_requested') THEN
      IF p_expected IS NULL OR e.submitted_version_id IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Submission changed. Refresh before reviewing'; END IF;
      SELECT * INTO v FROM essay_draft_versions WHERE id=p_expected AND essay_draft_id=e.id;
      IF v.id IS NULL OR v.body IS DISTINCT FROM e.body OR v.version_number<>e.current_version_number THEN RAISE EXCEPTION 'The draft changed. Ask for a new submission'; END IF;
      IF p_action='revision_requested' AND nullif(trim(p_feedback),'') IS NULL THEN RAISE EXCEPTION 'Feedback is required'; END IF;
      IF (p_action IN ('approved','final') AND e.status NOT IN ('in_review','approved','final')) OR
         (p_action='revision_requested' AND e.status NOT IN ('in_review','revision_requested')) THEN RAISE EXCEPTION 'Submit the current draft first'; END IF;
      IF EXISTS (SELECT 1 FROM tasks WHERE firm_id=p_firm AND related_entity_type='essay' AND related_entity_id=e.id
        AND completion_mode='review_required' AND archived_at IS NULL AND
        (reviewer_user_id IS DISTINCT FROM p_actor OR dependency_blocked OR needs_attention OR owner_pending)) THEN RAISE EXCEPTION 'The assigned reviewer must resolve linked tasks first'; END IF;
    END IF;
    UPDATE essay_drafts SET status=p_action,updated_by_user_id=p_actor WHERE id=e.id AND firm_id=p_firm;
    UPDATE tasks SET status=CASE WHEN p_action IN ('approved','final') THEN 'completed' ELSE 'changes_requested' END,
      completed_at=CASE WHEN p_action IN ('approved','final') THEN now() ELSE NULL END,review_feedback=p_feedback,updated_by_user_id=p_actor
      WHERE firm_id=p_firm AND related_entity_type='essay' AND related_entity_id=e.id AND completion_mode<>'simple' AND archived_at IS NULL;
    IF nullif(trim(p_feedback),'') IS NOT NULL THEN
      INSERT INTO essay_feedback(firm_id,essay_draft_id,version_number,author_user_id,body)
        SELECT p_firm,e.id,v.version_number,p_actor,p_feedback WHERE NOT EXISTS
        (SELECT 1 FROM essay_feedback WHERE firm_id=p_firm AND essay_draft_id=e.id AND version_number=v.version_number AND author_user_id=p_actor AND body=p_feedback);
    END IF;
  ELSE RAISE EXCEPTION 'Invalid essay action'; END IF;
  RETURN jsonb_build_object('version',coalesce(next_version,e.current_version_number),'submission',coalesce(vid,e.submitted_version_id));
END $$;

CREATE FUNCTION public.transition_task(p_firm uuid,p_actor uuid,p_task uuid,p_action text,p_expected uuid DEFAULT NULL,p_feedback text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE t tasks; r text; dr document_requests; doc documents;
BEGIN
  SELECT * INTO t FROM tasks WHERE id=p_task AND firm_id=p_firm AND archived_at IS NULL FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
  r:=public.work_actor(p_firm,p_actor,t.student_id);
  IF t.owner_pending THEN RAISE EXCEPTION 'Resolve the task owner first'; END IF;
  IF r IN ('student','parent_guardian') AND (t.assigned_user_id IS DISTINCT FROM p_actor OR t.task_type='review' OR
    (r='student' AND t.visibility_scope NOT IN ('student','family')) OR (r='parent_guardian' AND t.visibility_scope<>'family')) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF t.student_id IS NULL AND r NOT IN ('firm_owner','firm_admin','read_only_staff') AND t.assigned_user_id<>p_actor AND t.created_by_user_id<>p_actor THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_action NOT IN ('pending','reopen') AND (t.dependency_blocked OR t.needs_attention) THEN RAISE EXCEPTION 'Resolve the prerequisite and reopen affected work first'; END IF;
  IF p_action IN ('approved','changes_requested') THEN
    IF r IN ('student','parent_guardian') OR t.reviewer_user_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Only the assigned reviewer may decide'; END IF;
    IF p_action='changes_requested' AND nullif(trim(p_feedback),'') IS NULL THEN RAISE EXCEPTION 'Feedback is required'; END IF;
    IF t.completion_mode<>'review_required' THEN RAISE EXCEPTION 'This task does not require review'; END IF;
    IF t.related_entity_type='essay' THEN
      PERFORM public.write_essay(p_firm,p_actor,t.related_entity_id,CASE WHEN p_action='approved' THEN 'approved' ELSE 'revision_requested' END,NULL,p_expected,p_feedback);
      RETURN;
    END IF;
    IF t.submitted_document_id IS NULL OR t.submitted_document_id IS DISTINCT FROM p_expected OR ((p_action='approved' AND t.status NOT IN ('submitted','completed')) OR (p_action='changes_requested' AND t.status NOT IN ('submitted','changes_requested'))) THEN RAISE EXCEPTION 'Submission changed. Refresh before reviewing'; END IF;
    SELECT * INTO doc FROM documents WHERE id=p_expected AND firm_id=p_firm AND student_id=t.student_id AND archived_at IS NULL;
    IF doc.id IS NULL THEN RAISE EXCEPTION 'Submitted document unavailable'; END IF;
    UPDATE tasks SET status=CASE WHEN p_action='approved' THEN 'completed' ELSE 'changes_requested' END,
      completed_at=CASE WHEN p_action='approved' THEN now() ELSE NULL END,review_feedback=p_feedback,updated_by_user_id=p_actor WHERE id=t.id AND firm_id=p_firm;
    IF p_action='changes_requested' THEN UPDATE document_requests SET status='requested' WHERE id=t.related_entity_id AND firm_id=p_firm; END IF;
  ELSIF p_action='submit' THEN
    IF t.completion_mode='simple' THEN RAISE EXCEPTION 'This task uses simple completion'; END IF;
    IF t.related_entity_type='essay' THEN PERFORM public.write_essay(p_firm,p_actor,t.related_entity_id,'submit'); RETURN; END IF;
    IF t.related_entity_type<>'document_request' THEN RAISE EXCEPTION 'Link an essay or document request first'; END IF;
    SELECT * INTO dr FROM document_requests WHERE id=t.related_entity_id AND firm_id=p_firm AND status='fulfilled';
    SELECT * INTO doc FROM documents WHERE id=dr.fulfilled_document_id AND firm_id=p_firm AND student_id=t.student_id AND archived_at IS NULL;
    IF dr.id IS NULL OR doc.id IS NULL OR (dr.student_id IS NOT NULL AND dr.student_id<>t.student_id) THEN RAISE EXCEPTION 'Upload to the linked request first'; END IF;
    IF dr.student_id IS NULL AND NOT EXISTS (SELECT 1 FROM students WHERE id=t.student_id AND firm_id=p_firm AND family_id=dr.family_id) THEN RAISE EXCEPTION 'Request not accessible'; END IF;
    IF (r='student' AND doc.visibility_scope NOT IN ('student','family')) OR (r='parent_guardian' AND doc.visibility_scope<>'family') THEN RAISE EXCEPTION 'Document not accessible'; END IF;
    IF t.status IN ('submitted','completed') AND t.submitted_document_id=doc.id THEN RETURN; END IF;
    UPDATE tasks SET submitted_document_id=doc.id,submitted_version_id=NULL,review_feedback=NULL,
      status=CASE WHEN completion_mode='evidence' THEN 'completed' ELSE 'submitted' END,
      completed_at=CASE WHEN completion_mode='evidence' THEN now() ELSE NULL END,updated_by_user_id=p_actor WHERE id=t.id AND firm_id=p_firm;
  ELSIF p_action IN ('pending','reopen') THEN
    IF t.needs_attention AND r IN ('student','parent_guardian') THEN RAISE EXCEPTION 'Your counselor must reopen affected work'; END IF;
    IF t.related_entity_type='essay' AND t.completion_mode<>'simple' THEN
      IF r IN ('student','parent_guardian') THEN RAISE EXCEPTION 'Ask your counselor to reopen the essay'; END IF;
      UPDATE tasks SET needs_attention=false WHERE id=t.id AND firm_id=p_firm;
      PERFORM public.write_essay(p_firm,p_actor,t.related_entity_id,'draft'); RETURN;
    END IF;
    UPDATE tasks SET status='pending',completed_at=NULL,needs_attention=false,updated_by_user_id=p_actor WHERE id=t.id AND firm_id=p_firm;
  ELSIF p_action IN ('completed','in_progress','cancelled') THEN
    IF t.completion_mode<>'simple' AND p_action='completed' THEN RAISE EXCEPTION 'Submit the deliverable for this task'; END IF;
    IF t.status IN ('submitted','changes_requested') AND p_action='in_progress' THEN RAISE EXCEPTION 'Submit the revised deliverable'; END IF;
    IF r IN ('student','parent_guardian') AND (p_action='cancelled' OR t.status='cancelled') THEN RAISE EXCEPTION 'Not authorized'; END IF;
    UPDATE tasks SET status=p_action,completed_at=CASE WHEN p_action='completed' THEN coalesce(completed_at,now()) ELSE NULL END,updated_by_user_id=p_actor WHERE id=t.id AND firm_id=p_firm;
  ELSE RAISE EXCEPTION 'Invalid task action'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.work_actor(uuid,uuid,uuid), public.materialize_workflow_task(uuid,uuid,uuid,uuid,text,boolean),
 public.write_essay(uuid,uuid,uuid,text,text,uuid,text,text), public.transition_task(uuid,uuid,uuid,text,uuid,text), public.sync_task_step() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_actor(uuid,uuid,uuid), public.materialize_workflow_task(uuid,uuid,uuid,uuid,text,boolean),
 public.write_essay(uuid,uuid,uuid,text,text,uuid,text,text), public.transition_task(uuid,uuid,uuid,text,uuid,text) TO authenticated, service_role;

CREATE FUNCTION public.reconcile_workflow(p_workflow uuid,p_firm uuid,p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE sw student_workflows; total integer; done integer;
BEGIN
  SELECT * INTO sw FROM student_workflows WHERE id=p_workflow AND firm_id=p_firm FOR UPDATE;
  IF sw.id IS NULL THEN RAISE EXCEPTION 'Workflow not found'; END IF;
  PERFORM public.work_actor(p_firm,p_actor,sw.student_id);
  UPDATE student_workflow_steps st SET status='pending' FROM workflow_template_steps ts
    WHERE st.student_workflow_id=sw.id AND st.template_step_id=ts.id AND st.status='blocked'
    AND (ts.depends_on_step_id IS NULL OR EXISTS (SELECT 1 FROM student_workflow_steps p
      WHERE p.student_workflow_id=sw.id AND p.template_step_id=ts.depends_on_step_id AND p.status='completed'));
  UPDATE tasks t SET dependency_blocked=false FROM student_workflow_steps st
    WHERE st.student_workflow_id=sw.id AND st.linked_task_id=t.id AND st.status='pending' AND t.firm_id=p_firm AND t.dependency_blocked;
  SELECT count(*),count(*) FILTER (WHERE status IN ('completed','skipped')) INTO total,done FROM student_workflow_steps WHERE student_workflow_id=sw.id;
  UPDATE student_workflows SET status=CASE WHEN total>0 AND total=done THEN 'completed'
      WHEN EXISTS (SELECT 1 FROM student_workflow_steps WHERE student_workflow_id=sw.id AND status IN ('in_progress','completed','skipped')) THEN 'in_progress'
      ELSE 'not_started' END, completed_at=CASE WHEN total>0 AND total=done THEN coalesce(completed_at,now()) ELSE NULL END
    WHERE id=sw.id AND firm_id=p_firm AND status NOT IN ('paused','cancelled');
END $$;
REVOKE ALL ON FUNCTION public.reconcile_workflow(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reconcile_workflow(uuid,uuid,uuid) TO authenticated,service_role;

-- Creating an instance and its steps is one transaction. Duplicate plan policy
-- remains Phase D; a failed step insert must never leave a half-created plan.
CREATE FUNCTION public.create_workflow_instance(p_firm uuid,p_actor uuid,p_student uuid,p_template uuid,p_details jsonb,p_steps jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE sw student_workflows; r text; entry jsonb; n integer;
BEGIN
  r:=public.work_actor(p_firm,p_actor,p_student);
  IF r IN ('student','parent_guardian') THEN RAISE EXCEPTION 'Only staff may assign plans'; END IF;
  PERFORM 1 FROM workflow_templates WHERE id=p_template AND (firm_id=p_firm OR is_system_template) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;
  SELECT count(*) INTO n FROM workflow_template_steps WHERE workflow_template_id=p_template;
  IF jsonb_typeof(p_steps)<>'array' OR jsonb_array_length(p_steps)<>n THEN RAISE EXCEPTION 'Template changed. Preview again'; END IF;
  IF (SELECT count(DISTINCT value->>'template_step_id') FROM jsonb_array_elements(p_steps))<>n THEN RAISE EXCEPTION 'Duplicate template step'; END IF;
  IF p_details->>'student_college_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM student_colleges
    WHERE id=(p_details->>'student_college_id')::uuid AND student_id=p_student AND firm_id=p_firm) THEN RAISE EXCEPTION 'College not accessible'; END IF;
  INSERT INTO student_workflows(firm_id,student_id,workflow_template_id,name,description,student_college_id,due_date,created_by_user_id,status)
    VALUES(p_firm,p_student,p_template,p_details->>'name',p_details->>'description',(p_details->>'student_college_id')::uuid,
      (p_details->>'due_date')::date,p_actor,'not_started') RETURNING * INTO sw;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_steps) LOOP
    IF NOT EXISTS (SELECT 1 FROM workflow_template_steps WHERE id=(entry->>'template_step_id')::uuid AND workflow_template_id=p_template) THEN RAISE EXCEPTION 'Template step not found'; END IF;
    IF entry->>'assigned_user_id' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM firm_memberships m WHERE m.firm_id=p_firm AND m.user_id=(entry->>'assigned_user_id')::uuid AND m.status='active' AND (
      m.role IN ('firm_owner','firm_admin','read_only_staff') OR
      (m.role IN ('counselor','essay_coach','tutor') AND EXISTS (SELECT 1 FROM student_staff_assignments a WHERE a.firm_id=p_firm AND a.student_id=p_student AND a.user_id=(entry->>'assigned_user_id')::uuid)) OR
      (m.role='student' AND EXISTS (SELECT 1 FROM students s WHERE s.id=p_student AND s.firm_id=p_firm AND s.user_id=(entry->>'assigned_user_id')::uuid)) OR
      (m.role='parent_guardian' AND EXISTS (SELECT 1 FROM students s JOIN family_members f ON s.family_id=f.family_id WHERE s.id=p_student AND s.firm_id=p_firm AND f.firm_id=p_firm AND f.user_id=(entry->>'assigned_user_id')::uuid))
    )) THEN RAISE EXCEPTION 'Owner not eligible'; END IF;
    INSERT INTO student_workflow_steps(student_workflow_id,template_step_id,status,step_order,assigned_user_id,due_date)
      SELECT sw.id,id,CASE WHEN depends_on_step_id IS NULL THEN 'pending' ELSE 'blocked' END,step_order,
        (entry->>'assigned_user_id')::uuid,(entry->>'due_date')::date FROM workflow_template_steps WHERE id=(entry->>'template_step_id')::uuid AND workflow_template_id=p_template;
  END LOOP;
  RETURN to_jsonb(sw) || jsonb_build_object('student_workflow_steps',coalesce((SELECT jsonb_agg(to_jsonb(st) ORDER BY step_order)
    FROM student_workflow_steps st WHERE student_workflow_id=sw.id),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.create_workflow_instance(uuid,uuid,uuid,uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_workflow_instance(uuid,uuid,uuid,uuid,jsonb,jsonb) TO authenticated,service_role;
