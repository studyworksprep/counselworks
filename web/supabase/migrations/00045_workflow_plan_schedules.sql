-- Phase D: immutable instance settings, calendar dates, and assignment serialization.
-- Existing dates remain untouched. Legacy steps continue using their prior settings.
ALTER TABLE student_workflow_steps ADD COLUMN snapshot_json jsonb;
ALTER TABLE student_workflows ADD COLUMN repeat_key uuid;
CREATE UNIQUE INDEX workflow_repeat_key ON student_workflows(firm_id,repeat_key) WHERE repeat_key IS NOT NULL;
ALTER TABLE tasks ADD COLUMN due_on date, ADD COLUMN due_timezone text;
ALTER TABLE applications ADD COLUMN deadline_source text NOT NULL DEFAULT 'legacy_unknown'
  CHECK(deadline_source IN ('explicit','estimate','legacy_unknown'));
-- Do not cascade template deletion into client work.
ALTER TABLE student_workflow_steps DROP CONSTRAINT student_workflow_steps_template_step_id_fkey;
ALTER TABLE student_workflow_steps ADD CONSTRAINT student_workflow_steps_template_step_id_fkey
  FOREIGN KEY(template_step_id) REFERENCES workflow_template_steps(id) ON DELETE RESTRICT;
ALTER TABLE student_workflows DROP CONSTRAINT student_workflows_workflow_template_id_fkey;
ALTER TABLE student_workflows ADD CONSTRAINT student_workflows_workflow_template_id_fkey
  FOREIGN KEY(workflow_template_id) REFERENCES workflow_templates(id) ON DELETE RESTRICT;

CREATE FUNCTION public.plan_due_at(p_date date,p_zone text) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  SELECT ((p_date+1)::timestamp AT TIME ZONE p_zone) - interval '1 millisecond';
$$;
REVOKE ALL ON FUNCTION public.plan_due_at(date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.plan_due_at(date,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.create_workflow_instance(p_firm uuid,p_actor uuid,p_student uuid,p_template uuid,p_details jsonb,p_steps jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE sw student_workflows; r text; entry jsonb; n integer; check_row jsonb; prior student_workflows; sc uuid; repeat_id uuid;
BEGIN
  r:=public.work_actor(p_firm,p_actor,p_student);
  IF r IN ('student','parent_guardian') THEN RAISE EXCEPTION 'Only staff may assign plans'; END IF;
  sc:=(p_details->>'student_college_id')::uuid;
  repeat_id:=(p_details->>'repeat_key')::uuid;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_firm::text||p_student::text||p_template::text||coalesce(sc::text,''),0));
  IF repeat_id IS NOT NULL THEN
    SELECT * INTO prior FROM student_workflows WHERE firm_id=p_firm AND repeat_key=repeat_id;
    IF prior.id IS NOT NULL AND (prior.student_id<>p_student OR prior.workflow_template_id<>p_template OR prior.student_college_id IS DISTINCT FROM sc)
      THEN RAISE EXCEPTION 'Repeat intent belongs to another plan'; END IF;
  ELSE
    SELECT * INTO prior FROM student_workflows WHERE firm_id=p_firm AND student_id=p_student AND workflow_template_id=p_template
      AND student_college_id IS NOT DISTINCT FROM sc AND status<>'cancelled' ORDER BY created_at LIMIT 1;
  END IF;
  IF prior.id IS NOT NULL THEN
    RETURN to_jsonb(prior) || jsonb_build_object('reused',true,'student_workflow_steps',coalesce((SELECT jsonb_agg(to_jsonb(st)) FROM student_workflow_steps st WHERE student_workflow_id=prior.id),'[]'::jsonb));
  END IF;
  PERFORM 1 FROM workflow_templates WHERE id=p_template AND (firm_id=p_firm OR is_system_template) AND is_active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;
  IF EXISTS (SELECT 1 FROM workflow_templates WHERE id=p_template AND (instantiation_scope='student_college') IS DISTINCT FROM (sc IS NOT NULL)) THEN RAISE EXCEPTION 'Choose the correct plan scope'; END IF;
  -- Row locks keep preview source checks valid through the insert. Also lock
  -- the template parent for step insertion/deletion through its FK.
  PERFORM 1 FROM workflow_template_steps WHERE workflow_template_id=p_template FOR SHARE;
  IF p_details->'source_checks' IS NOT NULL THEN
    PERFORM 1 FROM students WHERE id=p_student AND firm_id=p_firm AND updated_at=(p_details->'source_checks'->'student'->>'updated_at')::timestamptz FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Student changed. Preview again'; END IF;
    IF (SELECT count(*) FROM applications WHERE firm_id=p_firm AND student_id=p_student AND (sc IS NULL OR college_id=(SELECT college_id FROM student_colleges WHERE id=sc AND firm_id=p_firm)))
       <>jsonb_array_length(p_details->'source_checks'->'applications') THEN RAISE EXCEPTION 'Applications changed. Preview again'; END IF;
    IF NOT EXISTS (SELECT 1 FROM workflow_templates WHERE id=p_template AND updated_at=(p_details->'source_checks'->'template'->>'updated_at')::timestamptz) THEN RAISE EXCEPTION 'Template changed. Preview again'; END IF;
    FOR check_row IN SELECT value FROM jsonb_array_elements(p_details->'source_checks'->'steps') LOOP
      IF NOT EXISTS (SELECT 1 FROM workflow_template_steps WHERE workflow_template_id=p_template AND id=(check_row->>'id')::uuid AND updated_at=(check_row->>'updated_at')::timestamptz) THEN RAISE EXCEPTION 'Template changed. Preview again'; END IF;
    END LOOP;
    FOR check_row IN SELECT value FROM jsonb_array_elements(p_details->'source_checks'->'applications') LOOP
      PERFORM 1 FROM applications WHERE firm_id=p_firm AND student_id=p_student AND id=(check_row->>'id')::uuid AND updated_at=(check_row->>'updated_at')::timestamptz FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Application changed. Preview again'; END IF;
    END LOOP;
  END IF;
  SELECT count(*) INTO n FROM workflow_template_steps WHERE workflow_template_id=p_template;
  IF jsonb_typeof(p_steps)<>'array' OR jsonb_array_length(p_steps)<>n THEN RAISE EXCEPTION 'Template changed. Preview again'; END IF;
  IF (SELECT count(DISTINCT value->>'template_step_id') FROM jsonb_array_elements(p_steps))<>n THEN RAISE EXCEPTION 'Duplicate template step'; END IF;
  IF p_details->>'student_college_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM student_colleges
    WHERE id=(p_details->>'student_college_id')::uuid AND student_id=p_student AND firm_id=p_firm) THEN RAISE EXCEPTION 'College not accessible'; END IF;
  INSERT INTO student_workflows(firm_id,student_id,workflow_template_id,name,description,student_college_id,due_date,created_by_user_id,status,repeat_key)
    VALUES(p_firm,p_student,p_template,p_details->>'name',p_details->>'description',(p_details->>'student_college_id')::uuid,
      (p_details->>'due_date')::date,p_actor,'not_started',repeat_id) RETURNING * INTO sw;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_steps) LOOP
    IF NOT EXISTS (SELECT 1 FROM workflow_template_steps WHERE id=(entry->>'template_step_id')::uuid AND workflow_template_id=p_template) THEN RAISE EXCEPTION 'Template step not found'; END IF;
    IF entry->>'assigned_user_id' IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM firm_memberships m WHERE m.firm_id=p_firm AND m.user_id=(entry->>'assigned_user_id')::uuid AND m.status='active' AND (
      m.role IN ('firm_owner','firm_admin','read_only_staff') OR
      (m.role IN ('counselor','essay_coach','tutor') AND EXISTS (SELECT 1 FROM student_staff_assignments a WHERE a.firm_id=p_firm AND a.student_id=p_student AND a.user_id=(entry->>'assigned_user_id')::uuid)) OR
      (m.role='student' AND EXISTS (SELECT 1 FROM students s WHERE s.id=p_student AND s.firm_id=p_firm AND s.user_id=(entry->>'assigned_user_id')::uuid)) OR
      (m.role='parent_guardian' AND EXISTS (SELECT 1 FROM students s JOIN family_members f ON s.family_id=f.family_id WHERE s.id=p_student AND s.firm_id=p_firm AND f.firm_id=p_firm AND f.user_id=(entry->>'assigned_user_id')::uuid))
    )) THEN RAISE EXCEPTION 'Owner not eligible'; END IF;
    IF entry->'snapshot_json' IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM workflow_template_steps t JOIN firms f ON f.id=p_firm WHERE t.id=(entry->>'template_step_id')::uuid
        AND t.workflow_template_id=p_template AND t.visibility_scope=entry->'snapshot_json'->>'visibility'
        AND t.completion_mode=entry->'snapshot_json'->>'completionMode'
        AND t.depends_on_step_id IS NOT DISTINCT FROM (entry->'snapshot_json'->>'dependency')::uuid
        AND coalesce(f.timezone,'America/New_York')=entry->'snapshot_json'->>'timezone') THEN RAISE EXCEPTION 'Plan changed. Preview again'; END IF;
      IF nullif(trim(entry->'snapshot_json'->>'title'),'') IS NULL OR entry->'snapshot_json'->>'priority' NOT IN ('low','medium','high','urgent') THEN RAISE EXCEPTION 'Invalid plan settings'; END IF;
    END IF;
    INSERT INTO student_workflow_steps(student_workflow_id,template_step_id,status,step_order,assigned_user_id,due_date,snapshot_json,title,description)
      SELECT sw.id,id,CASE WHEN depends_on_step_id IS NULL THEN 'pending' ELSE 'blocked' END,step_order,
        (entry->>'assigned_user_id')::uuid,(entry->>'due_date')::date,entry->'snapshot_json',entry->'snapshot_json'->>'title',entry->'snapshot_json'->>'description' FROM workflow_template_steps WHERE id=(entry->>'template_step_id')::uuid AND workflow_template_id=p_template;
  END LOOP;
  RETURN to_jsonb(sw) || jsonb_build_object('student_workflow_steps',coalesce((SELECT jsonb_agg(to_jsonb(st) ORDER BY step_order)
    FROM student_workflow_steps st WHERE student_workflow_id=sw.id),'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.materialize_workflow_task(p_step uuid,p_firm uuid,p_actor uuid,p_owner uuid,p_role text,p_ready boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE st student_workflow_steps; sw student_workflows; ts workflow_template_steps; result uuid; dependency uuid; zone text;
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
  dependency:=CASE WHEN st.snapshot_json IS NOT NULL THEN (st.snapshot_json->>'dependency')::uuid ELSE ts.depends_on_step_id END;
  SELECT coalesce(st.snapshot_json->>'timezone',timezone,'America/New_York') INTO zone FROM firms WHERE id=p_firm;
  IF dependency IS NOT NULL AND NOT EXISTS (SELECT 1 FROM student_workflow_steps
    WHERE student_workflow_id=sw.id AND template_step_id=dependency AND status='completed') THEN RETURN NULL; END IF;
  INSERT INTO tasks(firm_id,title,description,task_type,status,priority,visibility_scope,assigned_user_id,
    owner_role,owner_pending,student_id,due_at,created_by_user_id,updated_by_user_id,completion_mode,reviewer_user_id,due_on,due_timezone)
  VALUES(p_firm,coalesce(st.snapshot_json->>'title',st.title,ts.name),CASE WHEN st.snapshot_json IS NOT NULL THEN st.snapshot_json->>'description' ELSE coalesce(st.description,ts.description) END,coalesce(st.snapshot_json->>'taskType',ts.task_type,'workflow_step'),
    'pending',coalesce(st.snapshot_json->>'priority','medium'),coalesce(st.snapshot_json->>'visibility',ts.visibility_scope),p_owner,p_role,NOT p_ready,sw.student_id,public.plan_due_at(st.due_date,zone),
    coalesce(sw.created_by_user_id,p_actor),p_actor,coalesce(st.snapshot_json->>'completionMode',ts.completion_mode),
    CASE WHEN coalesce(st.snapshot_json->>'completionMode',ts.completion_mode)='review_required' THEN sw.created_by_user_id END,st.due_date,zone)
  RETURNING id INTO result;
  UPDATE student_workflow_steps SET linked_task_id=result WHERE id=p_step;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.sync_task_step() RETURNS trigger
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
      WHERE st.student_workflow_id=w AND (CASE WHEN st.snapshot_json IS NOT NULL THEN (st.snapshot_json->>'dependency')::uuid ELSE ts.depends_on_step_id END)=(SELECT template_step_id FROM student_workflow_steps WHERE id=s)
      UNION
      SELECT st.id,st.template_step_id,st.linked_task_id FROM student_workflow_steps st
      JOIN workflow_template_steps ts ON ts.id=st.template_step_id JOIN affected a ON a.template_step_id=(CASE WHEN st.snapshot_json IS NOT NULL THEN (st.snapshot_json->>'dependency')::uuid ELSE ts.depends_on_step_id END)
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
    AND ((CASE WHEN st.snapshot_json IS NOT NULL THEN (st.snapshot_json->>'dependency')::uuid ELSE ts.depends_on_step_id END) IS NULL OR EXISTS (SELECT 1 FROM student_workflow_steps p
      WHERE p.student_workflow_id=w AND p.template_step_id=(CASE WHEN st.snapshot_json IS NOT NULL THEN (st.snapshot_json->>'dependency')::uuid ELSE ts.depends_on_step_id END) AND p.status='completed'));
  UPDATE tasks t SET dependency_blocked=false FROM student_workflow_steps st
    WHERE st.student_workflow_id=w AND st.linked_task_id=t.id AND st.status='pending' AND t.firm_id=NEW.firm_id AND t.dependency_blocked;
  SELECT count(*),count(*) FILTER (WHERE status IN ('completed','skipped')) INTO total,done FROM student_workflow_steps WHERE student_workflow_id=w;
  UPDATE student_workflows SET status=CASE WHEN total>0 AND total=done THEN 'completed' ELSE 'in_progress' END,
    completed_at=CASE WHEN total>0 AND total=done THEN now() ELSE NULL END, started_at=coalesce(started_at,now())
    WHERE id=w AND firm_id=NEW.firm_id;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.reconcile_workflow(p_workflow uuid,p_firm uuid,p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE sw student_workflows; total integer; done integer;
BEGIN
  SELECT * INTO sw FROM student_workflows WHERE id=p_workflow AND firm_id=p_firm FOR UPDATE;
  IF sw.id IS NULL THEN RAISE EXCEPTION 'Workflow not found'; END IF;
  PERFORM public.work_actor(p_firm,p_actor,sw.student_id);
  UPDATE student_workflow_steps st SET status='pending' FROM workflow_template_steps ts
    WHERE st.student_workflow_id=sw.id AND st.template_step_id=ts.id AND st.status='blocked'
    AND ((CASE WHEN st.snapshot_json IS NOT NULL THEN (st.snapshot_json->>'dependency')::uuid ELSE ts.depends_on_step_id END) IS NULL OR EXISTS (SELECT 1 FROM student_workflow_steps p
      WHERE p.student_workflow_id=sw.id AND p.template_step_id=(CASE WHEN st.snapshot_json IS NOT NULL THEN (st.snapshot_json->>'dependency')::uuid ELSE ts.depends_on_step_id END) AND p.status='completed'));
  UPDATE tasks t SET dependency_blocked=false FROM student_workflow_steps st
    WHERE st.student_workflow_id=sw.id AND st.linked_task_id=t.id AND st.status='pending' AND t.firm_id=p_firm AND t.dependency_blocked;
  SELECT count(*),count(*) FILTER (WHERE status IN ('completed','skipped')) INTO total,done FROM student_workflow_steps WHERE student_workflow_id=sw.id;
  UPDATE student_workflows SET status=CASE WHEN total>0 AND total=done THEN 'completed'
      WHEN EXISTS (SELECT 1 FROM student_workflow_steps WHERE student_workflow_id=sw.id AND status IN ('in_progress','completed','skipped')) THEN 'in_progress'
      ELSE 'not_started' END, completed_at=CASE WHEN total>0 AND total=done THEN coalesce(completed_at,now()) ELSE NULL END
    WHERE id=sw.id AND firm_id=p_firm AND status NOT IN ('paused','cancelled');
END $$;

-- Preview and save invoke the same schedule calculation. The save compares the
-- entire proposal after locking the source and targets, preventing stale acceptance.
CREATE FUNCTION public.preview_application_schedule(p_firm uuid,p_actor uuid,p_application uuid,p_deadline date,p_round text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a applications; result jsonb;
BEGIN
  SELECT * INTO a FROM applications WHERE id=p_application AND firm_id=p_firm;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF public.work_actor(p_firm,p_actor,a.student_id) IN ('student','parent_guardian') THEN RAISE EXCEPTION 'Only staff may change schedules'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'old_date',s.due_date,
    'new_date',p_deadline+(s.snapshot_json->>'deadlineOffset')::integer,'updated_at',s.updated_at,
    'task_updated_at',t.updated_at) ORDER BY s.id),'[]'::jsonb) INTO result
    FROM student_workflow_steps s JOIN student_workflows w ON w.id=s.student_workflow_id
    LEFT JOIN tasks t ON t.id=s.linked_task_id AND t.firm_id=p_firm
    WHERE w.firm_id=p_firm AND w.student_id=a.student_id AND w.status<>'cancelled'
      AND s.snapshot_json->>'dueSource'='application' AND s.snapshot_json->>'applicationId'=a.id::text
      AND s.status NOT IN ('completed','skipped') AND (t.id IS NULL OR (t.status<>'completed' AND t.archived_at IS NULL));
  RETURN jsonb_build_object('application_updated_at',a.updated_at,'deadline',p_deadline,'round',p_round,'changes',result);
END $$;
CREATE FUNCTION public.update_application_schedule(p_firm uuid,p_actor uuid,p_application uuid,p_deadline date,p_round text,p_aid boolean,p_expected jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a applications; proposal jsonb; c jsonb;
BEGIN
  SELECT * INTO a FROM applications WHERE id=p_application AND firm_id=p_firm FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF public.work_actor(p_firm,p_actor,a.student_id) IN ('student','parent_guardian') THEN RAISE EXCEPTION 'Only staff may change schedules'; END IF;
  PERFORM 1 FROM student_workflows WHERE firm_id=p_firm AND student_id=a.student_id FOR UPDATE;
  PERFORM s.id FROM student_workflow_steps s JOIN student_workflows w ON w.id=s.student_workflow_id
    WHERE w.firm_id=p_firm AND w.student_id=a.student_id FOR UPDATE OF s;
  PERFORM 1 FROM tasks WHERE firm_id=p_firm AND student_id=a.student_id FOR UPDATE;
  proposal:=public.preview_application_schedule(p_firm,p_actor,p_application,p_deadline,p_round);
  IF proposal IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Schedule changed. Preview again before saving'; END IF;
  UPDATE applications SET deadline_at=p_deadline,application_type=p_round,financial_aid_required=p_aid,
    deadline_source=CASE WHEN p_deadline IS NULL THEN 'estimate' ELSE 'explicit' END,updated_by_user_id=p_actor,updated_at=clock_timestamp()
    WHERE id=a.id AND firm_id=p_firm;
  FOR c IN SELECT value FROM jsonb_array_elements(proposal->'changes') LOOP
    UPDATE student_workflow_steps SET due_date=(c->>'new_date')::date,
      snapshot_json=jsonb_set(snapshot_json,'{estimate}',to_jsonb(p_deadline IS NULL)),updated_at=clock_timestamp() WHERE id=(c->>'id')::uuid;
    UPDATE tasks t SET due_on=(c->>'new_date')::date,due_timezone=s.snapshot_json->>'timezone',
      due_at=public.plan_due_at((c->>'new_date')::date,s.snapshot_json->>'timezone'),updated_by_user_id=p_actor,updated_at=clock_timestamp()
      FROM student_workflow_steps s WHERE s.id=(c->>'id')::uuid AND s.linked_task_id=t.id AND t.firm_id=p_firm;
  END LOOP;
  UPDATE student_workflows w SET due_date=(SELECT max(due_date) FROM student_workflow_steps WHERE student_workflow_id=w.id)
    WHERE w.firm_id=p_firm AND w.student_id=a.student_id AND EXISTS (SELECT 1 FROM jsonb_array_elements(proposal->'changes') change_row
      JOIN student_workflow_steps s ON s.id=(change_row->>'id')::uuid WHERE s.student_workflow_id=w.id);
END $$;
REVOKE ALL ON FUNCTION public.preview_application_schedule(uuid,uuid,uuid,date,text),public.update_application_schedule(uuid,uuid,uuid,date,text,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_application_schedule(uuid,uuid,uuid,date,text),public.update_application_schedule(uuid,uuid,uuid,date,text,boolean,jsonb) TO authenticated,service_role;

CREATE FUNCTION public.edit_plan_step(p_firm uuid,p_actor uuid,p_step uuid,p_expected timestamptz,p_edit jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s student_workflow_steps; w student_workflows; t tasks; role text; owner uuid; ready boolean;
BEGIN
  SELECT * INTO s FROM student_workflow_steps WHERE id=p_step FOR UPDATE;
  SELECT * INTO w FROM student_workflows WHERE id=s.student_workflow_id AND firm_id=p_firm FOR UPDATE;
  IF w.id IS NULL THEN RAISE EXCEPTION 'Step not found'; END IF;
  IF public.work_actor(p_firm,p_actor,w.student_id) IN ('student','parent_guardian') THEN RAISE EXCEPTION 'Only staff may edit plans'; END IF;
  SELECT * INTO t FROM tasks WHERE id=s.linked_task_id AND firm_id=p_firm FOR UPDATE;
  IF s.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Step changed. Open the editor again'; END IF;
  IF s.status IN ('completed','skipped') OR t.status='completed' THEN RAISE EXCEPTION 'Reopen completed work before editing'; END IF;
  IF s.snapshot_json IS NULL THEN RAISE EXCEPTION 'This legacy step has no saved plan settings'; END IF;
  owner:=(p_edit->>'owner')::uuid;
  role:=p_edit->>'ownerRole'; ready:=(p_edit->>'ownerReady')::boolean;
  IF ready AND (owner IS NULL OR NOT EXISTS (SELECT 1 FROM firm_memberships m JOIN users u ON u.id=m.user_id
    WHERE m.firm_id=p_firm AND m.user_id=owner AND m.status='active'
    AND u.auth_provider_user_id NOT LIKE 'invited_%' AND u.auth_provider_user_id NOT LIKE 'pending_%')) THEN RAISE EXCEPTION 'Owner is not ready'; END IF;
  IF owner IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM firm_memberships m WHERE m.firm_id=p_firm AND m.user_id=owner AND m.status='active' AND (
      m.role IN ('firm_owner','firm_admin','read_only_staff') OR
      (m.role IN ('counselor','essay_coach','tutor') AND EXISTS (SELECT 1 FROM student_staff_assignments a WHERE a.firm_id=p_firm AND a.student_id=w.student_id AND a.user_id=owner)) OR
      (m.role='student' AND EXISTS (SELECT 1 FROM students eligible WHERE eligible.id=w.student_id AND eligible.firm_id=p_firm AND eligible.user_id=owner)) OR
      (m.role='parent_guardian' AND EXISTS (SELECT 1 FROM students eligible JOIN family_members f ON eligible.family_id=f.family_id WHERE eligible.id=w.student_id AND eligible.firm_id=p_firm AND f.firm_id=p_firm AND f.user_id=owner))
    )) AND NOT (NOT ready AND EXISTS (SELECT 1 FROM family_members fm JOIN students eligible_student ON eligible_student.family_id=fm.family_id JOIN users u ON u.id=fm.user_id WHERE eligible_student.id=w.student_id AND eligible_student.firm_id=p_firm AND fm.firm_id=p_firm AND fm.user_id=owner AND (u.auth_provider_user_id LIKE 'invited_%' OR u.auth_provider_user_id LIKE 'pending_%'))) THEN RAISE EXCEPTION 'Owner not eligible'; END IF;
  UPDATE student_workflow_steps SET title=p_edit->>'title',description=p_edit->>'description',assigned_user_id=CASE WHEN ready THEN owner END,
    due_date=CASE WHEN p_edit ? 'due' THEN (p_edit->>'due')::date ELSE due_date END,
    snapshot_json=snapshot_json || jsonb_build_object('title',p_edit->>'title','description',p_edit->>'description','priority',p_edit->>'priority',
      'owner',owner,'ownerRole',role,'ownerReady',ready) || CASE WHEN p_edit ? 'due' THEN '{"dueSource":"manual","estimate":false}'::jsonb ELSE '{}'::jsonb END,
    updated_at=clock_timestamp() WHERE id=s.id;
  UPDATE tasks SET title=p_edit->>'title',description=p_edit->>'description',priority=p_edit->>'priority',assigned_user_id=owner,
    owner_role=role,owner_pending=NOT ready,
    due_on=CASE WHEN p_edit ? 'due' THEN (p_edit->>'due')::date ELSE due_on END,
    due_timezone=s.snapshot_json->>'timezone',
    due_at=CASE WHEN p_edit ? 'due' THEN public.plan_due_at((p_edit->>'due')::date,s.snapshot_json->>'timezone') ELSE due_at END,
    updated_by_user_id=p_actor,updated_at=clock_timestamp() WHERE id=t.id AND firm_id=p_firm;
  UPDATE student_workflows SET due_date=(SELECT max(due_date) FROM student_workflow_steps WHERE student_workflow_id=w.id) WHERE id=w.id AND firm_id=p_firm;
END $$;
REVOKE ALL ON FUNCTION public.edit_plan_step(uuid,uuid,uuid,timestamptz,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.edit_plan_step(uuid,uuid,uuid,timestamptz,jsonb) TO authenticated,service_role;

-- Owner resolution through Tasks must also update the saved instance settings.
CREATE FUNCTION public.sync_task_plan_settings() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  UPDATE student_workflow_steps s SET assigned_user_id=CASE WHEN NOT NEW.owner_pending THEN NEW.assigned_user_id END,
    title=NEW.title,description=NEW.description,snapshot_json=snapshot_json || jsonb_build_object(
      'title',NEW.title,'description',NEW.description,'priority',NEW.priority,'owner',NEW.assigned_user_id,
      'ownerRole',NEW.owner_role,'ownerReady',NOT NEW.owner_pending)
    FROM student_workflows w WHERE s.student_workflow_id=w.id AND w.firm_id=NEW.firm_id AND s.linked_task_id=NEW.id AND s.snapshot_json IS NOT NULL;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_task_plan_settings() FROM PUBLIC,anon;
CREATE TRIGGER task_plan_settings AFTER UPDATE OF title,description,priority,assigned_user_id,owner_role,owner_pending ON tasks
  FOR EACH ROW EXECUTE FUNCTION public.sync_task_plan_settings();

-- All date-picker task creation paths write due_on. Recurrences and timed work
-- continue writing only due_at, retaining their existing time of day.
CREATE FUNCTION public.set_task_calendar_deadline() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NEW.due_on IS NOT NULL THEN
    IF NEW.due_timezone IS NULL THEN SELECT coalesce(timezone,'America/New_York') INTO NEW.due_timezone FROM firms WHERE id=NEW.firm_id; END IF;
    NEW.due_at:=public.plan_due_at(NEW.due_on,NEW.due_timezone);
  ELSIF TG_OP='UPDATE' AND OLD.due_on IS NOT NULL THEN NEW.due_at:=NULL; NEW.due_timezone:=NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.set_task_calendar_deadline() FROM PUBLIC,anon;
CREATE TRIGGER task_calendar_deadline BEFORE INSERT OR UPDATE OF due_on,due_timezone ON tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_task_calendar_deadline();

-- Historical settings are never guessed or rewritten by this migration.
-- Staff may explicitly freeze one displayed legacy plan before reusing its template.
CREATE FUNCTION public.freeze_plan_settings(p_firm uuid,p_actor uuid,p_workflow uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE w student_workflows; zone text;
BEGIN
  SELECT * INTO w FROM student_workflows WHERE id=p_workflow AND firm_id=p_firm FOR UPDATE;
  IF w.id IS NULL THEN RAISE EXCEPTION 'Plan not found'; END IF;
  IF public.work_actor(p_firm,p_actor,w.student_id) IN ('student','parent_guardian') THEN RAISE EXCEPTION 'Only staff may preserve plan settings'; END IF;
  UPDATE student_workflows SET name=coalesce(w.name,(SELECT name FROM workflow_templates WHERE id=w.workflow_template_id)) WHERE id=w.id AND firm_id=p_firm;
  SELECT coalesce(timezone,'America/New_York') INTO zone FROM firms WHERE id=p_firm;
  PERFORM t.id FROM workflow_template_steps t JOIN student_workflow_steps s ON s.template_step_id=t.id WHERE s.student_workflow_id=w.id FOR SHARE OF t;
  UPDATE student_workflow_steps s SET step_order=coalesce(s.step_order,t.step_order),snapshot_json=jsonb_build_object(
    'title',coalesce(task.title,s.title,t.name),'description',CASE WHEN task.id IS NOT NULL THEN task.description ELSE coalesce(s.description,t.description) END,
    'priority',coalesce(task.priority,'medium'),'visibility',coalesce(task.visibility_scope,t.visibility_scope),
    'owner',coalesce(task.assigned_user_id,s.assigned_user_id),'ownerRole',coalesce(task.owner_role,m.role,t.default_assignee_role,'counselor'),
    'ownerReady',CASE WHEN task.id IS NOT NULL THEN NOT task.owner_pending ELSE s.assigned_user_id IS NOT NULL END,
    'completionMode',coalesce(task.completion_mode,t.completion_mode),'taskType',coalesce(task.task_type,t.task_type,'workflow_step'),
    'dependency',t.depends_on_step_id,'dueSource','legacy','applicationId',NULL,'deadlineOffset',NULL,'estimate',true,'timezone',coalesce(task.due_timezone,zone))
    FROM workflow_template_steps t LEFT JOIN student_workflow_steps original ON original.template_step_id=t.id AND original.student_workflow_id=w.id
    LEFT JOIN tasks task ON task.id=original.linked_task_id AND task.firm_id=p_firm
    LEFT JOIN firm_memberships m ON m.firm_id=p_firm AND m.user_id=original.assigned_user_id AND m.status='active'
    WHERE s.student_workflow_id=w.id AND s.template_step_id=t.id AND s.snapshot_json IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.freeze_plan_settings(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.freeze_plan_settings(uuid,uuid,uuid) TO authenticated,service_role;
CREATE FUNCTION public.protect_legacy_plan_settings() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM student_workflow_steps WHERE template_step_id=OLD.id AND snapshot_json IS NULL) THEN
    RAISE EXCEPTION 'Preserve current settings on existing student plans before editing this template';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_legacy_plan_settings() FROM PUBLIC,anon;
CREATE TRIGGER protect_legacy_plan_settings BEFORE UPDATE ON workflow_template_steps FOR EACH ROW EXECUTE FUNCTION public.protect_legacy_plan_settings();
CREATE FUNCTION public.protect_legacy_template_name() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name AND EXISTS (SELECT 1 FROM student_workflows WHERE workflow_template_id=OLD.id AND name IS NULL) THEN
    RAISE EXCEPTION 'Preserve current settings on existing student plans before renaming this template';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_legacy_template_name() FROM PUBLIC,anon;
CREATE TRIGGER protect_legacy_template_name BEFORE UPDATE ON workflow_templates FOR EACH ROW EXECUTE FUNCTION public.protect_legacy_template_name();
