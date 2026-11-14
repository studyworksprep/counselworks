-- Outlines are working documents, separate from essay writing and approval.
CREATE TABLE student_essay_outlines (
 essay_id uuid PRIMARY KEY REFERENCES essay_drafts(id) ON DELETE CASCADE,
 firm_id uuid NOT NULL REFERENCES firms(id),student_id uuid NOT NULL REFERENCES students(id),
 content jsonb NOT NULL,context_versions jsonb NOT NULL,
 review_state text NOT NULL DEFAULT 'draft' CHECK(review_state IN ('draft','confirmed','revisit')),
 family_shared boolean NOT NULL DEFAULT false CHECK(NOT family_shared OR review_state='confirmed'),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),updated_at timestamptz NOT NULL DEFAULT now(),
 created_by_user_id uuid NOT NULL REFERENCES users(id),updated_by_user_id uuid NOT NULL REFERENCES users(id)
);
CREATE INDEX essay_outlines_student ON student_essay_outlines(firm_id,student_id);
ALTER TABLE student_essay_outlines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON student_essay_outlines FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON student_essay_outlines TO authenticated;
GRANT ALL ON student_essay_outlines TO service_role;

CREATE FUNCTION public.essay_outline_context(p_firm uuid,p_essay uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT jsonb_build_object(
  'plan_revision',(SELECT revision FROM student_essay_plans WHERE firm_id=p_firm AND essay_id=e.id),
  'prompt_signature',md5(jsonb_build_object('text',e.prompt_text,'words',coalesce(e.word_count_limit,e.word_count_target),
    'characters',e.character_count_limit,'snapshot',e.library_prompt_snapshot,'college',e.student_college_id,'application',e.application_id)::text),
  'prompt_set_id',(SELECT ps.id FROM college_prompt_sets ps JOIN colleges c ON c.scorecard_id=ps.scorecard_id
    JOIN student_colleges sc ON sc.college_id=c.id AND sc.firm_id=p_firm AND sc.student_id=e.student_id
    JOIN students s ON s.id=e.student_id AND s.firm_id=p_firm
    WHERE (sc.id=e.student_college_id OR EXISTS(SELECT 1 FROM applications a WHERE a.id=e.application_id AND a.firm_id=p_firm AND a.student_college_id=sc.id))
     AND ps.entry_year=s.graduation_year AND ps.review_state='published' AND (ps.firm_id IS NULL OR ps.firm_id=p_firm)
    ORDER BY (ps.firm_id IS NOT NULL) DESC,ps.published_at DESC NULLS LAST LIMIT 1),
  'source_versions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'revision',b.revision) ORDER BY b.id),'[]'::jsonb)
    FROM student_story_essay_links l JOIN student_story_bank b ON b.id=l.entry_id AND b.firm_id=p_firm AND b.student_id=e.student_id
    WHERE l.firm_id=p_firm AND l.student_id=e.student_id AND l.essay_id=e.id))
 FROM essay_drafts e WHERE e.firm_id=p_firm AND e.id=p_essay;
$$;

CREATE FUNCTION public.essay_outline_content_valid(p_content jsonb,p_context jsonb,p_confirmed boolean) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE beat jsonb; entry jsonb;
BEGIN
 IF jsonb_typeof(p_content) IS DISTINCT FROM 'object' OR jsonb_typeof(p_context) IS DISTINCT FROM 'object' OR p_confirmed IS NULL THEN RETURN false; END IF;
 IF NOT(p_content ?& ARRAY['purpose','beats']) OR (SELECT count(*) FROM jsonb_object_keys(p_content))<>2
  OR jsonb_typeof(p_content->'purpose') IS DISTINCT FROM 'string' OR length(p_content->>'purpose')>2000
  OR jsonb_typeof(p_content->'beats') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(p_content->'beats')>12 OR jsonb_typeof(p_context->'source_versions') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF p_confirmed AND (length(btrim(p_content->>'purpose'))=0 OR jsonb_array_length(p_content->'beats')=0) THEN RETURN false; END IF;
 FOR beat IN SELECT value FROM jsonb_array_elements(p_content->'beats') LOOP
  IF jsonb_typeof(beat) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF NOT(beat ?& ARRAY['id','heading','notes','entry_ids']) OR (SELECT count(*) FROM jsonb_object_keys(beat))<>4
   OR jsonb_typeof(beat->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(beat->'heading') IS DISTINCT FROM 'string'
   OR jsonb_typeof(beat->'notes') IS DISTINCT FROM 'string' OR jsonb_typeof(beat->'entry_ids') IS DISTINCT FROM 'array'
   OR length(beat->>'heading')>160 OR length(beat->>'notes')>3000 THEN RETURN false; END IF;
  PERFORM (beat->>'id')::uuid;
  IF p_confirmed AND (length(btrim(beat->>'heading'))=0 OR length(btrim(beat->>'notes'))=0) THEN RETURN false; END IF;
  IF jsonb_array_length(beat->'entry_ids')>20 OR jsonb_array_length(beat->'entry_ids')<>(SELECT count(DISTINCT value) FROM jsonb_array_elements(beat->'entry_ids')) THEN RETURN false; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(beat->'entry_ids') LOOP
   IF jsonb_typeof(entry) IS DISTINCT FROM 'string' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_context->'source_versions') ref WHERE ref->'id'=entry) THEN RETURN false; END IF;
  END LOOP;
 END LOOP;
 RETURN jsonb_array_length(p_content->'beats')=(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_content->'beats'));
EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END $$;

CREATE FUNCTION public.essay_outline_shareable(p_firm uuid,p_student uuid,p_essay uuid,p_context jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT coalesce(p_context=public.essay_outline_context(p_firm,p_essay)
  AND public.essay_plan_sources_ready(p_firm,p_student,p_essay,p_context->'source_versions',true,true)
  AND EXISTS(SELECT 1 FROM essay_drafts e WHERE e.id=p_essay AND e.firm_id=p_firm AND e.student_id=p_student AND e.visibility_scope IN ('family','firm'))
  AND (p_context->>'plan_revision' IS NULL OR EXISTS(SELECT 1 FROM student_essay_plans p WHERE p.essay_id=p_essay AND p.firm_id=p_firm AND p.student_id=p_student AND p.family_shared AND p.review_state='confirmed' AND public.essay_plan_sources_ready(p_firm,p_student,p_essay,p.source_versions,true,true))),false);
$$;
CREATE POLICY essay_outlines_read ON student_essay_outlines FOR SELECT TO authenticated USING (
 public.interview_can_access(firm_id,student_id) AND EXISTS(SELECT 1 FROM essay_drafts e WHERE e.id=essay_id AND e.firm_id=student_essay_outlines.firm_id AND e.student_id=student_essay_outlines.student_id
  AND (public.is_staff() OR (public.current_member_role()='student' AND e.visibility_scope IN ('student','family','firm'))
   OR (public.current_member_role()='parent_guardian' AND family_shared AND review_state='confirmed'
    AND public.essay_outline_shareable(student_essay_outlines.firm_id,student_essay_outlines.student_id,essay_id,context_versions)))));
CREATE POLICY essay_outlines_insert ON student_essay_outlines FOR INSERT TO authenticated WITH CHECK(public.interview_can_write_bank(firm_id,student_id) AND created_by_user_id=public.current_user_id());
CREATE POLICY essay_outlines_update ON student_essay_outlines FOR UPDATE TO authenticated USING(public.interview_can_write_bank(firm_id,student_id)) WITH CHECK(public.interview_can_write_bank(firm_id,student_id));

CREATE FUNCTION public.guard_essay_outline() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE e essay_drafts; r text;
BEGIN
 IF current_user IN ('postgres','service_role') THEN RETURN NEW; END IF;
 r:=public.work_actor(NEW.firm_id,public.current_user_id(),NEW.student_id);
 SELECT * INTO e FROM essay_drafts WHERE id=NEW.essay_id AND firm_id=NEW.firm_id AND student_id=NEW.student_id;
 IF r NOT IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor') OR e.id IS NULL
  OR (r='student' AND e.visibility_scope NOT IN ('student','family','firm')) OR NEW.updated_by_user_id IS DISTINCT FROM public.current_user_id() THEN RAISE EXCEPTION 'Outline editing access required'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.created_by_user_id IS DISTINCT FROM public.current_user_id() OR NEW.revision<>1 THEN RAISE EXCEPTION 'Invalid outline author'; END IF;
 ELSE
  IF (NEW.essay_id,NEW.firm_id,NEW.student_id,NEW.created_by_user_id) IS DISTINCT FROM (OLD.essay_id,OLD.firm_id,OLD.student_id,OLD.created_by_user_id) THEN RAISE EXCEPTION 'Outline identity cannot change'; END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Outline changed in another window'; END IF;
  IF NEW.content=OLD.content AND NEW.context_versions=OLD.context_versions AND NEW.review_state='draft' AND NOT NEW.family_shared THEN NEW.updated_at:=now();RETURN NEW; END IF;
 END IF;
 IF r<>'student' AND (NEW.review_state<>'draft' OR NEW.family_shared) THEN RAISE EXCEPTION 'Student reviews outlines and approves parent sharing'; END IF;
 IF NEW.context_versions IS DISTINCT FROM public.essay_outline_context(NEW.firm_id,NEW.essay_id) THEN RAISE EXCEPTION 'Planning context changed in another window'; END IF;
 IF NOT public.essay_outline_content_valid(NEW.content,NEW.context_versions,NEW.review_state='confirmed') THEN RAISE EXCEPTION 'Check the outline purpose, sections and connected material'; END IF;
 IF NOT public.essay_plan_sources_ready(NEW.firm_id,NEW.student_id,NEW.essay_id,NEW.context_versions->'source_versions',false,NEW.review_state='confirmed') THEN RAISE EXCEPTION 'Review connected material first'; END IF;
 IF NEW.review_state='confirmed' AND EXISTS(SELECT 1 FROM student_essay_plans p WHERE p.firm_id=NEW.firm_id AND p.essay_id=NEW.essay_id AND (p.review_state<>'confirmed' OR NOT public.essay_plan_sources_ready(NEW.firm_id,NEW.student_id,NEW.essay_id,p.source_versions,false,true))) THEN RAISE EXCEPTION 'Review the response plan first'; END IF;
 IF NEW.family_shared AND NOT public.essay_outline_shareable(NEW.firm_id,NEW.student_id,NEW.essay_id,NEW.context_versions) THEN RAISE EXCEPTION 'The essay, plan and connected material must be shared with family first'; END IF;
 NEW.updated_at:=now();RETURN NEW;
END $$;
CREATE TRIGGER guard_essay_outline BEFORE INSERT OR UPDATE ON student_essay_outlines FOR EACH ROW EXECUTE FUNCTION public.guard_essay_outline();

CREATE FUNCTION public.revisit_essay_outline() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE eid uuid; fid uuid;
BEGIN
 IF TG_OP='DELETE' THEN eid:=OLD.essay_id;fid:=OLD.firm_id;ELSE eid:=NEW.essay_id;fid:=NEW.firm_id;END IF;
 IF EXISTS(SELECT 1 FROM essay_drafts WHERE id=eid AND firm_id=fid) THEN
  UPDATE student_essay_outlines SET review_state='draft',family_shared=false,revision=revision+1,updated_at=now(),updated_by_user_id=coalesce(public.current_user_id(),updated_by_user_id) WHERE firm_id=fid AND essay_id=eid;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER revisit_essay_outline_links AFTER INSERT OR DELETE ON student_story_essay_links FOR EACH ROW EXECUTE FUNCTION public.revisit_essay_outline();
CREATE TRIGGER revisit_essay_outline_plan AFTER INSERT OR UPDATE OR DELETE ON student_essay_plans FOR EACH ROW EXECUTE FUNCTION public.revisit_essay_outline();

CREATE FUNCTION public.save_essay_outline(p_firm uuid,p_actor uuid,p_essay uuid,p_revision integer,p_content jsonb,p_context jsonb,p_review text,p_family boolean)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE e essay_drafts; previous student_essay_outlines; r text; expected jsonb; result integer;
BEGIN
 SELECT * INTO e FROM essay_drafts WHERE id=p_essay AND firm_id=p_firm FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Essay not found'; END IF;
 r:=public.work_actor(p_firm,p_actor,e.student_id);
 IF r NOT IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor') OR (r='student' AND e.visibility_scope NOT IN ('student','family','firm')) THEN RAISE EXCEPTION 'Outline editing access required'; END IF;
 SELECT * INTO previous FROM student_essay_outlines WHERE firm_id=p_firm AND essay_id=e.id FOR UPDATE;
 IF p_revision IS NULL OR coalesce(previous.revision,0)<>p_revision THEN RAISE EXCEPTION 'Outline changed in another window'; END IF;
 PERFORM b.id FROM student_story_bank b JOIN student_story_essay_links l ON l.entry_id=b.id AND l.firm_id=p_firm AND l.essay_id=e.id WHERE b.firm_id=p_firm ORDER BY b.id FOR SHARE OF b;
 expected:=public.essay_outline_context(p_firm,e.id);
 IF p_context IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Planning context changed in another window'; END IF;
 IF p_review IS NULL OR p_review NOT IN ('draft','confirmed','revisit') OR p_family IS NULL OR NOT public.essay_outline_content_valid(p_content,p_context,p_review='confirmed') THEN RAISE EXCEPTION 'Check the outline purpose, sections and connected material'; END IF;
 IF r<>'student' AND (p_review<>'draft' OR p_family) THEN RAISE EXCEPTION 'Student reviews outlines and approves parent sharing'; END IF;
 IF NOT public.essay_plan_sources_ready(p_firm,e.student_id,e.id,p_context->'source_versions',false,p_review='confirmed') THEN RAISE EXCEPTION 'Review connected material first'; END IF;
 IF p_review='confirmed' AND EXISTS(SELECT 1 FROM student_essay_plans p WHERE p.firm_id=p_firm AND p.essay_id=e.id AND (p.review_state<>'confirmed' OR NOT public.essay_plan_sources_ready(p_firm,e.student_id,e.id,p.source_versions,false,true))) THEN RAISE EXCEPTION 'Review the response plan first'; END IF;
 IF p_family AND (p_review<>'confirmed' OR NOT public.essay_outline_shareable(p_firm,e.student_id,e.id,p_context)) THEN RAISE EXCEPTION 'The essay, plan and connected material must be shared with family first'; END IF;
 result:=coalesce(previous.revision,0)+1;
 IF previous.essay_id IS NULL THEN
  INSERT INTO student_essay_outlines(essay_id,firm_id,student_id,content,context_versions,review_state,family_shared,created_by_user_id,updated_by_user_id) VALUES(e.id,p_firm,e.student_id,p_content,p_context,p_review,p_family,p_actor,p_actor);
 ELSE
  UPDATE student_essay_outlines SET content=p_content,context_versions=p_context,review_state=p_review,family_shared=p_family,revision=result,updated_at=now(),updated_by_user_id=p_actor WHERE firm_id=p_firm AND essay_id=e.id;
 END IF;
 RETURN result;
END $$;

-- Feedback and saved history are coaching material; family essay sharing does
-- not publish private comments or earlier draft versions.
CREATE TABLE essay_submission_versions (
 version_id uuid PRIMARY KEY REFERENCES essay_draft_versions(id) ON DELETE CASCADE,
 firm_id uuid NOT NULL REFERENCES firms(id),student_id uuid NOT NULL REFERENCES students(id),
 essay_id uuid NOT NULL REFERENCES essay_drafts(id) ON DELETE CASCADE,
 submitted_at timestamptz NOT NULL DEFAULT now(),submitted_by_user_id uuid NOT NULL REFERENCES users(id)
);
CREATE INDEX essay_submissions_essay ON essay_submission_versions(firm_id,essay_id);
ALTER TABLE essay_submission_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON essay_submission_versions FROM anon,authenticated;
GRANT SELECT,INSERT ON essay_submission_versions TO authenticated;
GRANT ALL ON essay_submission_versions TO service_role;
CREATE POLICY essay_submissions_read ON essay_submission_versions FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM essay_drafts e WHERE e.id=essay_id AND e.firm_id=essay_submission_versions.firm_id AND e.student_id=essay_submission_versions.student_id AND public.interview_can_access(e.firm_id,e.student_id)
  AND (public.is_staff() OR (public.current_member_role()='student' AND e.visibility_scope IN ('student','family','firm')))));
CREATE POLICY essay_submissions_insert ON essay_submission_versions FOR INSERT TO authenticated WITH CHECK (
 submitted_by_user_id=public.current_user_id() AND public.interview_can_write_bank(firm_id,student_id)
 AND EXISTS(SELECT 1 FROM essay_drafts e WHERE e.id=essay_id AND e.firm_id=essay_submission_versions.firm_id AND e.student_id=essay_submission_versions.student_id AND e.submitted_version_id=version_id AND e.status='in_review'
  AND (public.is_staff() OR e.visibility_scope IN ('student','family','firm'))));
CREATE FUNCTION public.guard_essay_submission_version() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM essay_drafts e JOIN essay_draft_versions v ON v.essay_draft_id=e.id WHERE e.id=NEW.essay_id AND e.firm_id=NEW.firm_id AND e.student_id=NEW.student_id AND v.id=NEW.version_id AND e.submitted_version_id=v.id AND e.status='in_review') THEN RAISE EXCEPTION 'Submission history must match the submitted essay version'; END IF;
 NEW.submitted_at:=now();RETURN NEW;
END $$;
CREATE TRIGGER guard_essay_submission_version BEFORE INSERT ON essay_submission_versions FOR EACH ROW EXECUTE FUNCTION public.guard_essay_submission_version();
CREATE FUNCTION public.record_essay_submission_version() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 INSERT INTO essay_submission_versions(version_id,firm_id,student_id,essay_id,submitted_by_user_id)
 VALUES(NEW.submitted_version_id,NEW.firm_id,NEW.student_id,NEW.id,NEW.updated_by_user_id) ON CONFLICT(version_id) DO NOTHING;
 RETURN NULL;
END $$;
CREATE TRIGGER record_essay_submission_version AFTER UPDATE OF submitted_version_id ON essay_drafts FOR EACH ROW
 WHEN (NEW.submitted_version_id IS NOT NULL AND NEW.submitted_version_id IS DISTINCT FROM OLD.submitted_version_id) EXECUTE FUNCTION public.record_essay_submission_version();
CREATE POLICY essay_feedback_coaching_read ON essay_feedback AS RESTRICTIVE FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM essay_drafts e WHERE e.id=essay_draft_id AND e.firm_id=essay_feedback.firm_id AND public.interview_can_access(e.firm_id,e.student_id)
  AND (public.is_staff() OR (public.current_member_role()='student' AND e.visibility_scope IN ('student','family','firm')))));
CREATE POLICY essay_feedback_coaching_write ON essay_feedback AS RESTRICTIVE FOR UPDATE TO authenticated USING (
 public.current_member_role()<>'parent_guardian' AND EXISTS(SELECT 1 FROM essay_drafts e WHERE e.id=essay_draft_id AND e.firm_id=essay_feedback.firm_id AND public.interview_can_write_bank(e.firm_id,e.student_id)
  AND (public.is_staff() OR (e.visibility_scope IN ('student','family','firm') AND e.status NOT IN ('approved','final'))))) WITH CHECK (
 public.current_member_role()<>'parent_guardian' AND EXISTS(SELECT 1 FROM essay_drafts e WHERE e.id=essay_draft_id AND e.firm_id=essay_feedback.firm_id AND public.interview_can_write_bank(e.firm_id,e.student_id)
  AND (public.is_staff() OR (e.visibility_scope IN ('student','family','firm') AND e.status NOT IN ('approved','final')))));
CREATE POLICY essay_feedback_coaching_insert ON essay_feedback AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (
 EXISTS(SELECT 1 FROM essay_drafts e WHERE e.id=essay_draft_id AND e.firm_id=essay_feedback.firm_id AND public.interview_can_write_bank(e.firm_id,e.student_id)
  AND (public.is_staff() OR (public.current_member_role()='student' AND e.visibility_scope IN ('student','family','firm') AND e.status NOT IN ('approved','final')))));
REVOKE DELETE ON essay_feedback FROM authenticated;
CREATE POLICY essay_versions_coaching_read ON essay_draft_versions AS RESTRICTIVE FOR SELECT TO authenticated USING (
 EXISTS(SELECT 1 FROM essay_drafts e WHERE e.id=essay_draft_id AND public.interview_can_access(e.firm_id,e.student_id)
  AND (public.is_staff() OR (public.current_member_role()='student' AND e.visibility_scope IN ('student','family','firm')))));

CREATE FUNCTION public.guard_essay_feedback() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE e essay_drafts; r text;
BEGIN
 IF current_user IN ('postgres','service_role') THEN RETURN NEW; END IF;
 SELECT * INTO e FROM essay_drafts WHERE id=NEW.essay_draft_id AND firm_id=NEW.firm_id;
 r:=public.work_actor(NEW.firm_id,public.current_user_id(),e.student_id);
 IF r NOT IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor') OR e.id IS NULL OR (r='student' AND (e.visibility_scope NOT IN ('student','family','firm') OR e.status IN ('approved','final'))) THEN RAISE EXCEPTION 'Coaching access required'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.id,NEW.firm_id,NEW.essay_draft_id,NEW.version_number,NEW.author_user_id,NEW.body,NEW.quoted_text,NEW.anchor_start,NEW.anchor_end,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.firm_id,OLD.essay_draft_id,OLD.version_number,OLD.author_user_id,OLD.body,OLD.quoted_text,OLD.anchor_start,OLD.anchor_end,OLD.created_at) THEN RAISE EXCEPTION 'Feedback source is immutable'; END IF;
 ELSE
  IF NEW.author_user_id IS DISTINCT FROM public.current_user_id() OR NOT EXISTS(SELECT 1 FROM essay_draft_versions WHERE essay_draft_id=e.id AND version_number=NEW.version_number) OR length(btrim(NEW.body)) NOT BETWEEN 1 AND 12000 OR length(coalesce(NEW.quoted_text,''))>8000 THEN RAISE EXCEPTION 'Save the current draft before adding feedback'; END IF;
  IF NEW.quoted_text IS NOT NULL AND NOT EXISTS(SELECT 1 FROM essay_draft_versions v WHERE v.essay_draft_id=e.id AND v.version_number=NEW.version_number AND position(NEW.quoted_text IN v.body)>0) THEN RAISE EXCEPTION 'Save the quoted draft before adding feedback'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_essay_feedback BEFORE INSERT OR UPDATE ON essay_feedback FOR EACH ROW EXECUTE FUNCTION public.guard_essay_feedback();

ALTER TABLE tasks ADD COLUMN essay_feedback_id uuid REFERENCES essay_feedback(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX task_feedback_active ON tasks(firm_id,essay_feedback_id) WHERE essay_feedback_id IS NOT NULL AND archived_at IS NULL;
CREATE POLICY tasks_revision_source_read ON tasks AS RESTRICTIVE FOR SELECT TO authenticated USING (
 essay_feedback_id IS NULL OR EXISTS(SELECT 1 FROM essay_drafts e WHERE e.id=related_entity_id AND e.firm_id=tasks.firm_id AND e.student_id=tasks.student_id AND public.interview_can_access(e.firm_id,e.student_id)
  AND (public.is_staff() OR (public.current_member_role()='student' AND e.visibility_scope IN ('student','family','firm')))));
CREATE FUNCTION public.guard_revision_task() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE f essay_feedback; e essay_drafts; r text;
BEGIN
 IF TG_OP='UPDATE' AND OLD.essay_feedback_id IS NOT NULL AND (NEW.essay_feedback_id,NEW.firm_id,NEW.student_id,NEW.related_entity_type,NEW.related_entity_id) IS DISTINCT FROM (OLD.essay_feedback_id,OLD.firm_id,OLD.student_id,OLD.related_entity_type,OLD.related_entity_id) THEN RAISE EXCEPTION 'Revision source cannot change'; END IF;
 IF NEW.essay_feedback_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO f FROM essay_feedback WHERE id=NEW.essay_feedback_id AND firm_id=NEW.firm_id;
 SELECT * INTO e FROM essay_drafts WHERE id=f.essay_draft_id AND firm_id=NEW.firm_id AND student_id=NEW.student_id;
 IF f.id IS NULL OR e.id IS NULL OR NEW.related_entity_type IS DISTINCT FROM 'essay' OR NEW.related_entity_id IS DISTINCT FROM e.id OR NEW.visibility_scope NOT IN ('student','staff') OR NEW.completion_mode<>'simple'
  OR (NEW.visibility_scope='student' AND e.visibility_scope NOT IN ('student','family','firm'))
  OR NEW.owner_role IS DISTINCT FROM 'student' OR NEW.assigned_user_id IS DISTINCT FROM (SELECT user_id FROM students WHERE id=e.student_id AND firm_id=NEW.firm_id) THEN RAISE EXCEPTION 'Revision feedback stays with the student and counseling team'; END IF;
 r:=public.work_actor(NEW.firm_id,NEW.updated_by_user_id,NEW.student_id);
 IF r NOT IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Revision editing access required'; END IF;
 IF TG_OP='UPDATE' AND r='student' AND (to_jsonb(NEW)-ARRAY['status','completed_at','updated_by_user_id','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','completed_at','updated_by_user_id','updated_at']) THEN RAISE EXCEPTION 'Students update revision task completion; counselors edit instructions'; END IF;
 IF TG_OP='INSERT' OR OLD.essay_feedback_id IS NULL THEN
  r:=public.work_actor(NEW.firm_id,NEW.created_by_user_id,NEW.student_id);
  IF r NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') OR e.visibility_scope NOT IN ('student','family','firm') OR e.status IN ('approved','final') THEN RAISE EXCEPTION 'Reopen and share the essay before assigning revisions'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_revision_task BEFORE INSERT OR UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION public.guard_revision_task();

-- Narrow derived task access when the source essay is withdrawn, including
-- list queries that deliberately repeat audiences in the service fallback.
CREATE FUNCTION public.withdraw_essay_revision_tasks() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.visibility_scope NOT IN ('student','family','firm') THEN
  UPDATE tasks SET visibility_scope='staff',updated_by_user_id=NEW.updated_by_user_id,updated_at=now()
   WHERE firm_id=NEW.firm_id AND student_id=NEW.student_id AND related_entity_type='essay' AND related_entity_id=NEW.id AND essay_feedback_id IS NOT NULL AND visibility_scope<>'staff';
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER withdraw_essay_revision_tasks AFTER UPDATE OF visibility_scope ON essay_drafts FOR EACH ROW
 WHEN (NEW.visibility_scope IS DISTINCT FROM OLD.visibility_scope) EXECUTE FUNCTION public.withdraw_essay_revision_tasks();

CREATE FUNCTION public.create_essay_revision_task(p_firm uuid,p_actor uuid,p_feedback uuid,p_title text,p_instructions text,p_due date) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE f essay_feedback; e essay_drafts; s students; r text; result uuid; ready boolean; existing tasks; instructions text;
BEGIN
 SELECT * INTO f FROM essay_feedback WHERE id=p_feedback AND firm_id=p_firm FOR UPDATE;
 SELECT * INTO e FROM essay_drafts WHERE id=f.essay_draft_id AND firm_id=p_firm FOR SHARE;
 IF f.id IS NULL OR e.id IS NULL THEN RAISE EXCEPTION 'Feedback not found'; END IF;
 r:=public.work_actor(p_firm,p_actor,e.student_id);
 IF r NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') OR e.visibility_scope NOT IN ('student','family','firm') OR e.status IN ('approved','final') THEN RAISE EXCEPTION 'Reopen and share the essay before assigning revisions'; END IF;
 IF NOT EXISTS(SELECT 1 FROM firm_memberships WHERE firm_id=p_firm AND user_id=f.author_user_id AND role IN ('firm_owner','firm_admin','counselor','essay_coach','tutor')) THEN RAISE EXCEPTION 'Choose counselor feedback'; END IF;
 IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 200 OR p_instructions IS NULL OR length(btrim(p_instructions)) NOT BETWEEN 1 AND 6000 THEN RAISE EXCEPTION 'Add a title and revision instructions'; END IF;
 instructions:=btrim(p_instructions)||E'\n\nFrom feedback on essay version '||f.version_number||E':\n'||f.body||CASE WHEN f.quoted_text IS NULL THEN '' ELSE E'\nQuoted passage: '||f.quoted_text END;
 SELECT * INTO existing FROM tasks WHERE firm_id=p_firm AND essay_feedback_id=f.id AND archived_at IS NULL;
 IF existing.id IS NOT NULL THEN
  IF existing.title=btrim(p_title) AND existing.description=instructions AND existing.due_on IS NOT DISTINCT FROM p_due THEN RETURN existing.id; END IF;
  RAISE EXCEPTION 'A revision task already exists for this feedback';
 END IF;
 IF f.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'Choose unresolved counselor feedback'; END IF;
 SELECT * INTO s FROM students WHERE id=e.student_id AND firm_id=p_firm;
 SELECT EXISTS(SELECT 1 FROM firm_memberships m JOIN users u ON u.id=m.user_id WHERE m.firm_id=p_firm AND m.user_id=s.user_id AND m.status='active' AND m.role='student' AND u.auth_provider_user_id NOT LIKE 'invited_%' AND u.auth_provider_user_id NOT LIKE 'pending_%') INTO ready;
 INSERT INTO tasks(firm_id,student_id,title,description,task_type,status,priority,visibility_scope,owner_role,assigned_user_id,owner_pending,due_on,related_entity_type,related_entity_id,application_id,completion_mode,essay_feedback_id,created_by_user_id,updated_by_user_id)
 VALUES(p_firm,e.student_id,btrim(p_title),instructions,
 'follow_up','pending','medium','student','student',s.user_id,NOT ready,p_due,'essay',e.id,e.application_id,'simple',f.id,p_actor,p_actor) RETURNING id INTO result;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.essay_outline_context(uuid,uuid),public.essay_outline_content_valid(jsonb,jsonb,boolean),public.essay_outline_shareable(uuid,uuid,uuid,jsonb),public.guard_essay_outline(),public.revisit_essay_outline(),public.save_essay_outline(uuid,uuid,uuid,integer,jsonb,jsonb,text,boolean),public.guard_essay_feedback(),public.guard_revision_task(),public.create_essay_revision_task(uuid,uuid,uuid,text,text,date),public.guard_essay_submission_version(),public.record_essay_submission_version(),public.withdraw_essay_revision_tasks() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.essay_outline_context(uuid,uuid),public.essay_outline_content_valid(jsonb,jsonb,boolean),public.essay_outline_shareable(uuid,uuid,uuid,jsonb),public.save_essay_outline(uuid,uuid,uuid,integer,jsonb,jsonb,text,boolean),public.create_essay_revision_task(uuid,uuid,uuid,text,text,date) TO authenticated,service_role;
