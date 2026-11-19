-- Saved-version coaching reuses the student evidence catalog and existing
-- feedback/revision workflows. Requests are requester-private; feedback never
-- becomes family-visible through essay sharing.
-- Saved snapshots are append-only for ordinary accounts. Existing version saves
-- insert a new row; whole-essay deletion keeps its existing cascading behavior.
REVOKE UPDATE,DELETE ON essay_draft_versions FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.essay_coach_stamp(p_firm uuid,p_actor uuid,p_essay uuid,p_version uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE e essay_drafts; v essay_draft_versions; r text;
BEGIN
 SELECT * INTO e FROM essay_drafts WHERE firm_id=p_firm AND id=p_essay;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Essay unavailable'; END IF;
 r:=public.work_actor(p_firm,p_actor,e.student_id);
 IF r NOT IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor') OR
  (r='student' AND e.visibility_scope NOT IN ('student','family','firm')) THEN RAISE EXCEPTION 'Coaching access required'; END IF;
 SELECT * INTO v FROM essay_draft_versions WHERE id=p_version AND essay_draft_id=e.id;
 IF v.id IS NULL THEN RAISE EXCEPTION 'Choose an available saved draft version'; END IF;
 RETURN md5(jsonb_build_object('essay',e.id,'student',e.student_id,'prompt',e.prompt_text,
  'words',coalesce(e.word_count_limit,e.word_count_target),'characters',e.character_count_limit,
  'assignment',e.library_prompt_snapshot,'version',to_jsonb(v))::text);
END $$;

CREATE TABLE essay_coach_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), firm_id uuid NOT NULL REFERENCES firms(id),
 student_id uuid NOT NULL REFERENCES students(id), essay_id uuid NOT NULL REFERENCES essay_drafts(id) ON DELETE CASCADE,
 version_id uuid NOT NULL REFERENCES essay_draft_versions(id) ON DELETE CASCADE,
 owner_user_id uuid NOT NULL REFERENCES users(id), source_refs jsonb NOT NULL,
 task_stamp text NOT NULL CHECK(task_stamp ~ '^[a-f0-9]{32}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','failed','dismissed')),
 result jsonb, used_indices integer[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(jsonb_typeof(source_refs)='array' AND jsonb_array_length(source_refs) BETWEEN 1 AND 20),
 CHECK(result IS NULL OR (jsonb_typeof(result)='object' AND length(result::text)<=40000)),
 CHECK(status<>'ready' OR result IS NOT NULL), CHECK(cardinality(used_indices)<=8)
);
CREATE INDEX essay_coach_owner ON essay_coach_requests(firm_id,owner_user_id,essay_id,created_at DESC);
CREATE INDEX essay_coach_student ON essay_coach_requests(student_id);
CREATE INDEX essay_coach_essay ON essay_coach_requests(essay_id);
CREATE INDEX essay_coach_version ON essay_coach_requests(version_id);
CREATE INDEX essay_coach_user ON essay_coach_requests(owner_user_id);
ALTER TABLE essay_coach_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON essay_coach_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON essay_coach_requests TO authenticated,service_role;
GRANT DELETE ON essay_coach_requests TO service_role;
CREATE POLICY essay_coach_read ON essay_coach_requests FOR SELECT TO authenticated USING (
 owner_user_id=public.current_user_id() AND public.interview_can_write_bank(firm_id,student_id)
 AND public.essay_ai_sources_ready(firm_id,owner_user_id,student_id,source_refs,false,true)
 AND task_stamp=public.essay_coach_stamp(firm_id,owner_user_id,essay_id,version_id));
CREATE POLICY essay_coach_insert ON essay_coach_requests FOR INSERT TO authenticated WITH CHECK (
 owner_user_id=public.current_user_id() AND public.interview_can_write_bank(firm_id,student_id));
CREATE POLICY essay_coach_update ON essay_coach_requests FOR UPDATE TO authenticated USING (
 owner_user_id=public.current_user_id() AND public.interview_can_write_bank(firm_id,student_id)) WITH CHECK (
 owner_user_id=public.current_user_id() AND public.interview_can_write_bank(firm_id,student_id));

CREATE TABLE essay_coach_request_usage (
 request_id uuid PRIMARY KEY REFERENCES essay_coach_requests(id) ON DELETE CASCADE,
 firm_id uuid NOT NULL REFERENCES firms(id),owner_user_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX essay_coach_usage_owner ON essay_coach_request_usage(firm_id,owner_user_id,created_at);
CREATE INDEX essay_coach_usage_user ON essay_coach_request_usage(owner_user_id);
ALTER TABLE essay_coach_request_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON essay_coach_request_usage FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON essay_coach_request_usage TO authenticated,service_role;
GRANT DELETE ON essay_coach_request_usage TO service_role;
CREATE POLICY essay_coach_usage_read ON essay_coach_request_usage FOR SELECT TO authenticated USING(firm_id=public.firm_id() AND owner_user_id=public.current_user_id());
CREATE POLICY essay_coach_usage_insert ON essay_coach_request_usage FOR INSERT TO authenticated WITH CHECK(firm_id=public.firm_id() AND owner_user_id=public.current_user_id());
CREATE TRIGGER guard_essay_coach_usage BEFORE INSERT ON essay_coach_request_usage FOR EACH ROW EXECUTE FUNCTION public.guard_student_ai_usage();
CREATE OR REPLACE FUNCTION public.student_ai_quota_available(p_firm uuid,p_actor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT count(*) FILTER(WHERE created_at>now()-interval '1 hour')<10 AND count(*)<40 FROM (
  SELECT created_at FROM student_ai_request_usage WHERE firm_id=p_firm AND owner_user_id=p_actor AND created_at>now()-interval '24 hours'
  UNION ALL SELECT created_at FROM essay_ai_request_usage WHERE firm_id=p_firm AND owner_user_id=p_actor AND created_at>now()-interval '24 hours'
  UNION ALL SELECT created_at FROM essay_coach_request_usage WHERE firm_id=p_firm AND owner_user_id=p_actor AND created_at>now()-interval '24 hours'
 ) usage;
$$;
CREATE FUNCTION public.guard_essay_coach_request() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE e essay_drafts; v essay_draft_versions; r text; item jsonb; q text; first_pos integer;
BEGIN
 r:=public.work_actor(NEW.firm_id,NEW.owner_user_id,NEW.student_id);
 SELECT * INTO e FROM essay_drafts WHERE firm_id=NEW.firm_id AND student_id=NEW.student_id AND id=NEW.essay_id;
 IF e.id IS NULL OR r NOT IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor') OR
  (r='student' AND (e.visibility_scope NOT IN ('student','family') OR e.status IN ('approved','final'))) THEN RAISE EXCEPTION 'Coaching access required'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.id,NEW.firm_id,NEW.student_id,NEW.essay_id,NEW.version_id,NEW.owner_user_id,NEW.source_refs,NEW.task_stamp,NEW.created_at) IS DISTINCT FROM
   (OLD.id,OLD.firm_id,OLD.student_id,OLD.essay_id,OLD.version_id,OLD.owner_user_id,OLD.source_refs,OLD.task_stamp,OLD.created_at) THEN RAISE EXCEPTION 'Coaching request identity cannot change'; END IF;
  IF OLD.status NOT IN ('pending','ready') OR (OLD.status='pending' AND NEW.status NOT IN ('ready','failed')) OR
   (OLD.status='ready' AND NEW.status NOT IN ('ready','dismissed')) OR (OLD.status='ready' AND NEW.result IS DISTINCT FROM OLD.result)
   OR NOT NEW.used_indices @> OLD.used_indices THEN RAISE EXCEPTION 'Invalid coaching request transition'; END IF;
  IF NEW.status IN ('failed','dismissed') THEN RETURN NEW; END IF;
 ELSE
  IF NEW.status<>'pending' OR NEW.result IS NOT NULL OR cardinality(NEW.used_indices)<>0 THEN RAISE EXCEPTION 'New coaching requests start pending'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.firm_id::text||NEW.owner_user_id::text,641));
  IF NOT public.student_ai_quota_available(NEW.firm_id,NEW.owner_user_id) THEN RAISE EXCEPTION 'AI request limit reached; please try again later'; END IF;
  NEW.created_at:=now();
 END IF;
 IF NEW.task_stamp IS DISTINCT FROM public.essay_coach_stamp(NEW.firm_id,NEW.owner_user_id,NEW.essay_id,NEW.version_id)
  OR NOT public.essay_ai_sources_ready(NEW.firm_id,NEW.owner_user_id,NEW.student_id,NEW.source_refs,false,true) THEN RAISE EXCEPTION 'Saved version, prompt or cited context changed'; END IF;
 SELECT * INTO v FROM essay_draft_versions WHERE id=NEW.version_id AND essay_draft_id=e.id;
 IF length(btrim(coalesce(v.body,'')))=0 OR length(v.body)>50000 OR length(btrim(coalesce(e.prompt_text,'')))=0 OR length(e.prompt_text)>12000 THEN RAISE EXCEPTION 'Choose a nonempty saved version and assigned prompt within the coaching limits'; END IF;
 IF NEW.status='ready' THEN
  IF jsonb_typeof(NEW.result->'suggestions') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.result->'suggestions')>8 THEN RAISE EXCEPTION 'Invalid coaching suggestions'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.result->'suggestions') LOOP
   IF jsonb_typeof(item->'sourceKeys') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'sourceKeys') NOT BETWEEN 1 AND 20
    OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(item->'sourceKeys') k WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.source_refs) s WHERE (s->>'kind')||':'||(s->>'id')=k))
    THEN RAISE EXCEPTION 'Unsupported coaching citation'; END IF;
   q:=item->>'quote';
   IF q IS NOT NULL THEN
    first_pos:=position(q IN v.body);
    IF length(q) NOT BETWEEN 1 AND 8000 OR first_pos=0 OR position(q IN substring(v.body FROM first_pos+1))>0 THEN RAISE EXCEPTION 'Quote must identify one exact saved passage'; END IF;
   END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM unnest(NEW.used_indices) i WHERE i<0 OR i>=jsonb_array_length(NEW.result->'suggestions'))
   OR cardinality(NEW.used_indices)<>(SELECT count(DISTINCT i) FROM unnest(NEW.used_indices) i) THEN RAISE EXCEPTION 'Invalid coaching selection'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_essay_coach_request BEFORE INSERT OR UPDATE ON essay_coach_requests FOR EACH ROW EXECUTE FUNCTION public.guard_essay_coach_request();
CREATE FUNCTION public.record_essay_coach_usage() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN INSERT INTO essay_coach_request_usage(request_id,firm_id,owner_user_id) VALUES(NEW.id,NEW.firm_id,NEW.owner_user_id);RETURN NULL; END $$;
CREATE TRIGGER record_essay_coach_usage AFTER INSERT ON essay_coach_requests FOR EACH ROW EXECUTE FUNCTION public.record_essay_coach_usage();

ALTER TABLE essay_feedback ADD COLUMN ai_source_refs jsonb NOT NULL DEFAULT '[]';
-- Keep published provenance if a private request alone is removed, while allowing
-- the existing whole-essay cascade to remove its feedback and requests together.
ALTER TABLE essay_feedback ADD COLUMN coach_request_id uuid REFERENCES essay_coach_requests(id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE essay_feedback ADD COLUMN coach_suggestion_index integer;
ALTER TABLE essay_feedback ADD CONSTRAINT essay_feedback_coach_pair CHECK((coach_request_id IS NULL)=(coach_suggestion_index IS NULL));
CREATE UNIQUE INDEX essay_feedback_coach_once ON essay_feedback(coach_request_id,coach_suggestion_index) WHERE coach_request_id IS NOT NULL;
CREATE FUNCTION public.guard_essay_coach_feedback() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE req essay_coach_requests; v essay_draft_versions; item jsonb;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (NEW.ai_source_refs,NEW.coach_request_id,NEW.coach_suggestion_index) IS DISTINCT FROM (OLD.ai_source_refs,OLD.coach_request_id,OLD.coach_suggestion_index) THEN RAISE EXCEPTION 'Feedback citations cannot change'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.coach_request_id IS NULL THEN
  IF NEW.ai_source_refs<>'[]'::jsonb THEN RAISE EXCEPTION 'Coaching citations require a reviewed suggestion'; END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO req FROM essay_coach_requests WHERE id=NEW.coach_request_id AND firm_id=NEW.firm_id AND owner_user_id=NEW.author_user_id AND status='ready';
 IF req.id IS NULL OR req.essay_id<>NEW.essay_draft_id OR NEW.author_user_id<>req.owner_user_id
  OR NEW.coach_suggestion_index IS NULL OR NEW.coach_suggestion_index<0 OR NEW.coach_suggestion_index>=jsonb_array_length(req.result->'suggestions')
  OR NEW.coach_suggestion_index=ANY(req.used_indices) OR req.task_stamp IS DISTINCT FROM public.essay_coach_stamp(req.firm_id,req.owner_user_id,req.essay_id,req.version_id)
  OR NOT public.essay_ai_sources_ready(req.firm_id,req.owner_user_id,req.student_id,req.source_refs,false,true) THEN RAISE EXCEPTION 'Coaching suggestion unavailable or context changed'; END IF;
 SELECT * INTO v FROM essay_draft_versions WHERE id=req.version_id AND essay_draft_id=req.essay_id;
 PERFORM public.work_actor(req.firm_id,NEW.author_user_id,req.student_id);
 item:=req.result->'suggestions'->NEW.coach_suggestion_index;
 IF NEW.version_number<>v.version_number OR NEW.quoted_text IS DISTINCT FROM item->>'quote' OR NEW.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'Keep feedback bound to the reviewed saved passage'; END IF;
 NEW.ai_source_refs:=req.source_refs;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_essay_coach_feedback BEFORE INSERT OR UPDATE ON essay_feedback FOR EACH ROW EXECUTE FUNCTION public.guard_essay_coach_feedback();
CREATE POLICY essay_feedback_ai_read ON essay_feedback AS RESTRICTIVE FOR SELECT TO authenticated USING (
 ai_source_refs='[]'::jsonb OR public.is_staff() OR EXISTS(SELECT 1 FROM essay_drafts e WHERE e.id=essay_draft_id AND e.firm_id=essay_feedback.firm_id
  AND public.essay_ai_sources_ready(e.firm_id,public.current_user_id(),e.student_id,ai_source_refs,false,false)));
CREATE POLICY tasks_coaching_context_read ON tasks AS RESTRICTIVE FOR SELECT TO authenticated USING (
 essay_feedback_id IS NULL OR EXISTS(SELECT 1 FROM essay_feedback f WHERE f.id=tasks.essay_feedback_id AND f.firm_id=tasks.firm_id));

CREATE FUNCTION public.publish_essay_coaching(p_firm uuid,p_actor uuid,p_request uuid,p_index integer,p_body text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE req essay_coach_requests; v essay_draft_versions; e uuid; feedback uuid;
BEGIN
 SELECT essay_id INTO e FROM essay_coach_requests WHERE id=p_request AND firm_id=p_firm AND owner_user_id=p_actor;
 PERFORM id FROM essay_drafts WHERE id=e AND firm_id=p_firm FOR UPDATE;
 SELECT * INTO req FROM essay_coach_requests WHERE id=p_request AND firm_id=p_firm AND owner_user_id=p_actor FOR UPDATE;
 IF req.id IS NULL OR (current_user NOT IN ('postgres','service_role') AND p_actor IS DISTINCT FROM public.current_user_id()) THEN RAISE EXCEPTION 'Coaching suggestion unavailable'; END IF;
 PERFORM public.work_actor(p_firm,p_actor,req.student_id);
 IF length(btrim(p_body)) NOT BETWEEN 1 AND 12000 THEN RAISE EXCEPTION 'Review and edit the feedback before adding it'; END IF;
 SELECT * INTO v FROM essay_draft_versions WHERE id=req.version_id AND essay_draft_id=req.essay_id;
 INSERT INTO essay_feedback(firm_id,essay_draft_id,version_number,author_user_id,body,quoted_text,coach_request_id,coach_suggestion_index)
 VALUES(p_firm,req.essay_id,v.version_number,p_actor,p_body,req.result->'suggestions'->p_index->>'quote',req.id,p_index) RETURNING id INTO feedback;
 UPDATE essay_coach_requests SET used_indices=array_append(used_indices,p_index) WHERE firm_id=p_firm AND id=req.id;
 RETURN feedback;
END $$;
REVOKE ALL ON FUNCTION public.essay_coach_stamp(uuid,uuid,uuid,uuid),public.publish_essay_coaching(uuid,uuid,uuid,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.essay_coach_stamp(uuid,uuid,uuid,uuid),public.publish_essay_coaching(uuid,uuid,uuid,integer,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.guard_essay_coach_request(),public.record_essay_coach_usage(),public.guard_essay_coach_feedback() FROM PUBLIC,anon,authenticated;

-- The fallback app uses these IDs before counting/paginating portal task lists.
-- Under user-scoped RLS the hidden rows are already excluded and this is empty.
CREATE FUNCTION public.essay_coach_hidden_tasks(p_firm uuid,p_actor uuid) RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE hidden uuid[];
BEGIN
 IF current_user NOT IN ('postgres','service_role') AND (p_firm IS DISTINCT FROM public.firm_id() OR p_actor IS DISTINCT FROM public.current_user_id()) THEN RAISE EXCEPTION 'Task access required'; END IF;
 SELECT coalesce(array_agg(t.id),'{}') INTO hidden FROM tasks t JOIN students s ON s.id=t.student_id AND s.firm_id=t.firm_id
 JOIN essay_feedback f ON f.id=t.essay_feedback_id AND f.firm_id=t.firm_id
 WHERE t.firm_id=p_firm AND s.user_id=p_actor AND f.ai_source_refs<>'[]'::jsonb
 AND NOT public.essay_ai_sources_ready(p_firm,p_actor,s.id,f.ai_source_refs,false,false);
 RETURN hidden;
END $$;
REVOKE ALL ON FUNCTION public.essay_coach_hidden_tasks(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.essay_coach_hidden_tasks(uuid,uuid) TO authenticated,service_role;
CREATE FUNCTION public.guard_coaching_revision_context() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE f essay_feedback;
BEGIN
 IF NEW.essay_feedback_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO f FROM essay_feedback WHERE id=NEW.essay_feedback_id AND firm_id=NEW.firm_id;
 IF TG_OP='INSERT' AND f.ai_source_refs<>'[]'::jsonb AND NOT public.essay_ai_sources_ready(NEW.firm_id,NEW.created_by_user_id,NEW.student_id,f.ai_source_refs,false,true)
 THEN RAISE EXCEPTION 'Review current cited context before assigning a revision'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_coaching_revision_context BEFORE INSERT ON tasks FOR EACH ROW EXECUTE FUNCTION public.guard_coaching_revision_context();
REVOKE ALL ON FUNCTION public.guard_coaching_revision_context() FROM PUBLIC,anon,authenticated;
