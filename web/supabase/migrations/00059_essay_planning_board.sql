-- One set of essay/material connections serves the bank, essay and planning
-- surfaces. Existing story connections remain unchanged; narratives may join.
CREATE OR REPLACE FUNCTION public.guard_story_essay_link() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE link student_story_essay_links; e essay_drafts;
BEGIN
 IF TG_OP='DELETE' THEN link:=OLD; ELSE link:=NEW; END IF;
 IF current_user IN ('postgres','service_role') THEN RETURN link; END IF;
 SELECT * INTO e FROM essay_drafts WHERE id=link.essay_id AND firm_id=link.firm_id AND student_id=link.student_id FOR UPDATE;
 -- A foreign-key cascade can remove connections after the essay is deleted.
 IF NOT FOUND AND TG_OP='DELETE' AND pg_trigger_depth()>1 THEN RETURN OLD; END IF;
 IF e.id IS NULL OR NOT public.interview_can_write_bank(link.firm_id,link.student_id)
  OR (NOT public.is_staff() AND e.visibility_scope NOT IN ('student','family','firm'))
  OR (TG_OP='INSERT' AND (NEW.created_by_user_id IS DISTINCT FROM public.current_user_id()
    OR NOT EXISTS(SELECT 1 FROM student_story_bank b WHERE b.id=link.entry_id AND b.firm_id=link.firm_id AND b.student_id=link.student_id)))
 THEN RAISE EXCEPTION 'Material and essay must be accessible and belong to this student'; END IF;
 RETURN link;
END $$;
DROP TRIGGER guard_story_essay_link ON student_story_essay_links;
CREATE TRIGGER guard_story_essay_link BEFORE INSERT OR DELETE ON student_story_essay_links FOR EACH ROW EXECUTE FUNCTION public.guard_story_essay_link();

CREATE TABLE student_essay_plans (
 essay_id uuid PRIMARY KEY REFERENCES essay_drafts(id) ON DELETE CASCADE,
 firm_id uuid NOT NULL REFERENCES firms(id),student_id uuid NOT NULL REFERENCES students(id),
 approach text NOT NULL CHECK(approach IN ('exploring','experience','research')),
 angle text NOT NULL DEFAULT '' CHECK(length(angle)<=6000),
 source_versions jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(source_versions)='array' AND jsonb_array_length(source_versions)<=20),
 review_state text NOT NULL DEFAULT 'draft' CHECK(review_state IN ('draft','confirmed','revisit')),
 family_shared boolean NOT NULL DEFAULT false CHECK(NOT family_shared OR review_state='confirmed'),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),updated_at timestamptz NOT NULL DEFAULT now(),
 created_by_user_id uuid NOT NULL REFERENCES users(id),updated_by_user_id uuid NOT NULL REFERENCES users(id)
);
CREATE INDEX essay_plans_student ON student_essay_plans(firm_id,student_id);
ALTER TABLE student_essay_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON student_essay_plans FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON student_essay_plans TO authenticated;
GRANT ALL ON student_essay_plans TO service_role;

CREATE FUNCTION public.essay_plan_sources_ready(p_firm uuid,p_student uuid,p_essay uuid,p_refs jsonb,p_family boolean,p_confirmed boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE ref jsonb; b student_story_bank;
BEGIN
 IF jsonb_typeof(p_refs) IS DISTINCT FROM 'array' OR p_family IS NULL OR p_confirmed IS NULL THEN RETURN false; END IF;
 IF jsonb_array_length(p_refs)>20 OR jsonb_array_length(p_refs)<>(SELECT count(*) FROM student_story_essay_links WHERE firm_id=p_firm AND student_id=p_student AND essay_id=p_essay)
  OR jsonb_array_length(p_refs)<>(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_refs)) THEN RETURN false; END IF;
 FOR ref IN SELECT value FROM jsonb_array_elements(p_refs) LOOP
  IF jsonb_typeof(ref) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF NOT (ref ?& ARRAY['id','revision']) OR (SELECT count(*) FROM jsonb_object_keys(ref))<>2
   OR jsonb_typeof(ref->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(ref->'revision') IS DISTINCT FROM 'number'
   OR coalesce(ref->>'revision','') !~ '^[1-9][0-9]*$' THEN RETURN false; END IF;
  SELECT * INTO b FROM student_story_bank WHERE id=(ref->>'id')::uuid AND firm_id=p_firm AND student_id=p_student;
  IF NOT FOUND OR b.revision<>(ref->>'revision')::integer
   OR NOT EXISTS(SELECT 1 FROM student_story_essay_links WHERE firm_id=p_firm AND student_id=p_student AND essay_id=p_essay AND entry_id=b.id)
   OR ((p_family OR p_confirmed) AND b.review_state<>'confirmed') OR (p_family AND b.audience<>'family') THEN RETURN false; END IF;
  IF b.kind='narrative' AND (p_family OR p_confirmed) AND (
   cardinality(b.story_ids)=0 OR cardinality(b.story_ids)<>(SELECT count(*) FROM student_story_bank s WHERE s.firm_id=p_firm AND s.student_id=p_student AND s.id=ANY(b.story_ids) AND s.kind='story' AND s.review_state='confirmed' AND (NOT p_family OR s.audience='family'))
  ) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $$;

CREATE POLICY essay_plans_read ON student_essay_plans FOR SELECT TO authenticated USING (
 public.interview_can_access(firm_id,student_id) AND EXISTS(SELECT 1 FROM essay_drafts e
  WHERE e.id=essay_id AND e.firm_id=student_essay_plans.firm_id AND e.student_id=student_essay_plans.student_id AND (
   public.is_staff() OR (public.current_member_role()='student' AND e.visibility_scope IN ('student','family','firm'))
   OR (public.current_member_role()='parent_guardian' AND e.visibility_scope IN ('family','firm') AND family_shared AND review_state='confirmed'
    AND public.essay_plan_sources_ready(student_essay_plans.firm_id,student_essay_plans.student_id,essay_id,source_versions,true,true))
 )));
CREATE POLICY essay_plans_insert ON student_essay_plans FOR INSERT TO authenticated WITH CHECK (
 public.interview_can_write_bank(firm_id,student_id) AND created_by_user_id=public.current_user_id());
CREATE POLICY essay_plans_update ON student_essay_plans FOR UPDATE TO authenticated USING (
 public.interview_can_write_bank(firm_id,student_id)) WITH CHECK (public.interview_can_write_bank(firm_id,student_id));

CREATE FUNCTION public.guard_essay_plan() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r text; e essay_drafts;
BEGIN
 IF current_user IN ('postgres','service_role') THEN RETURN NEW; END IF;
 r:=public.work_actor(NEW.firm_id,public.current_user_id(),NEW.student_id);
 SELECT * INTO e FROM essay_drafts WHERE id=NEW.essay_id AND firm_id=NEW.firm_id AND student_id=NEW.student_id;
 IF r NOT IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor') OR e.id IS NULL
  OR (r='student' AND e.visibility_scope NOT IN ('student','family','firm')) OR NEW.updated_by_user_id IS DISTINCT FROM public.current_user_id()
 THEN RAISE EXCEPTION 'Essay planning access required'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.created_by_user_id IS DISTINCT FROM public.current_user_id() OR NEW.revision<>1 THEN RAISE EXCEPTION 'Invalid plan author'; END IF;
 ELSE
  IF (NEW.essay_id,NEW.firm_id,NEW.student_id,NEW.created_by_user_id) IS DISTINCT FROM (OLD.essay_id,OLD.firm_id,OLD.student_id,OLD.created_by_user_id)
   THEN RAISE EXCEPTION 'Plan identity cannot change'; END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Plan changed in another window'; END IF;
 END IF;
 IF r<>'student' AND (NEW.review_state<>'draft' OR NEW.family_shared) THEN RAISE EXCEPTION 'Student confirms plans and approves parent sharing'; END IF;
 -- Connection triggers may always narrow access without approving stale sources.
 IF TG_OP='UPDATE' AND (NEW.approach,NEW.angle,NEW.source_versions) IS NOT DISTINCT FROM (OLD.approach,OLD.angle,OLD.source_versions)
  AND NEW.review_state='draft' AND NOT NEW.family_shared THEN NEW.updated_at:=now();RETURN NEW; END IF;
 IF NOT public.essay_plan_sources_ready(NEW.firm_id,NEW.student_id,NEW.essay_id,NEW.source_versions,false,NEW.review_state='confirmed')
  THEN RAISE EXCEPTION 'Refresh the connected stories and narratives before saving'; END IF;
 IF NEW.review_state='confirmed' AND (length(btrim(NEW.angle))=0 OR NEW.approach='exploring' OR (NEW.approach='experience' AND jsonb_array_length(NEW.source_versions)=0))
  THEN RAISE EXCEPTION 'Choose an approach, add an angle, and connect material for an experience response'; END IF;
 IF NEW.family_shared AND (e.visibility_scope NOT IN ('family','firm') OR NOT public.essay_plan_sources_ready(NEW.firm_id,NEW.student_id,NEW.essay_id,NEW.source_versions,true,true))
  THEN RAISE EXCEPTION 'The essay and every connected source must be shared with family first'; END IF;
 NEW.updated_at:=now();RETURN NEW;
END $$;
CREATE TRIGGER guard_essay_plan BEFORE INSERT OR UPDATE ON student_essay_plans FOR EACH ROW EXECUTE FUNCTION public.guard_essay_plan();

CREATE FUNCTION public.revisit_connected_essay_plan() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE link student_story_essay_links;
BEGIN
 IF TG_OP='DELETE' THEN link:=OLD; ELSE link:=NEW; END IF;
 IF EXISTS(SELECT 1 FROM essay_drafts WHERE id=link.essay_id AND firm_id=link.firm_id AND student_id=link.student_id) THEN
  UPDATE student_essay_plans SET review_state='draft',family_shared=false,revision=revision+1,updated_at=now(),updated_by_user_id=coalesce(public.current_user_id(),updated_by_user_id)
   WHERE firm_id=link.firm_id AND student_id=link.student_id AND essay_id=link.essay_id;
 END IF;
 RETURN link;
END $$;
CREATE TRIGGER revisit_connected_essay_plan AFTER INSERT OR DELETE ON student_story_essay_links FOR EACH ROW EXECUTE FUNCTION public.revisit_connected_essay_plan();

CREATE FUNCTION public.save_essay_plan(p_firm uuid,p_actor uuid,p_essay uuid,p_revision integer,p_expected_links uuid[],p_entry_ids uuid[],p_approach text,p_angle text,p_review text,p_family boolean,p_source_versions jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE e essay_drafts; previous student_essay_plans; r text; actual_ids uuid[]; refs jsonb; next_revision integer;
BEGIN
 SELECT * INTO e FROM essay_drafts WHERE id=p_essay AND firm_id=p_firm FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Essay not found'; END IF;
 r:=public.work_actor(p_firm,p_actor,e.student_id);
 IF r NOT IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor') OR (r='student' AND e.visibility_scope NOT IN ('student','family','firm'))
  THEN RAISE EXCEPTION 'Essay planning access required'; END IF;
 IF p_approach IS NULL OR p_approach NOT IN ('exploring','experience','research') OR p_review IS NULL OR p_review NOT IN ('draft','confirmed','revisit')
  OR p_angle IS NULL OR length(p_angle)>6000 OR p_family IS NULL OR p_revision IS NULL OR p_revision<0
  OR p_entry_ids IS NULL OR cardinality(p_entry_ids)>20 OR p_expected_links IS NULL OR cardinality(p_expected_links)>1000
  OR array_position(p_entry_ids,NULL) IS NOT NULL OR array_position(p_expected_links,NULL) IS NOT NULL
  OR cardinality(p_entry_ids)<>(SELECT count(DISTINCT id) FROM unnest(p_entry_ids) id)
  OR cardinality(p_expected_links)<>(SELECT count(DISTINCT id) FROM unnest(p_expected_links) id) THEN RAISE EXCEPTION 'Invalid planning fields'; END IF;
 IF r<>'student' AND (p_review<>'draft' OR p_family) THEN RAISE EXCEPTION 'Student confirms plans and approves parent sharing'; END IF;
 SELECT * INTO previous FROM student_essay_plans WHERE firm_id=p_firm AND student_id=e.student_id AND essay_id=e.id FOR UPDATE;
 IF coalesce(previous.revision,0)<>p_revision THEN RAISE EXCEPTION 'Plan changed in another window'; END IF;
 SELECT coalesce(array_agg(entry_id ORDER BY entry_id),'{}'::uuid[]) INTO actual_ids FROM student_story_essay_links WHERE firm_id=p_firm AND student_id=e.student_id AND essay_id=e.id;
 IF actual_ids IS DISTINCT FROM ARRAY(SELECT id FROM unnest(p_expected_links) id ORDER BY id) THEN RAISE EXCEPTION 'Connections changed in another window'; END IF;
 IF cardinality(p_entry_ids)<>(SELECT count(*) FROM student_story_bank WHERE firm_id=p_firm AND student_id=e.student_id AND id=ANY(p_entry_ids)) THEN RAISE EXCEPTION 'Choose material for this student'; END IF;
 -- Confirm only the source revisions actually displayed in the editor. Dynamic
 -- read checks also hide a plan if material changes after this transaction.
 PERFORM id FROM student_story_bank WHERE firm_id=p_firm AND student_id=e.student_id AND id=ANY(p_entry_ids) ORDER BY id FOR SHARE;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision) ORDER BY id),'[]'::jsonb) INTO refs FROM student_story_bank WHERE firm_id=p_firm AND student_id=e.student_id AND id=ANY(p_entry_ids);
 IF jsonb_typeof(p_source_versions) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid source versions'; END IF;
 IF jsonb_array_length(p_source_versions)>20 THEN RAISE EXCEPTION 'Invalid source versions'; END IF;
 IF refs IS DISTINCT FROM (SELECT coalesce(jsonb_agg(value ORDER BY value->>'id'),'[]'::jsonb) FROM jsonb_array_elements(p_source_versions))
  THEN RAISE EXCEPTION 'Connected material changed in another window'; END IF;
 DELETE FROM student_story_essay_links WHERE firm_id=p_firm AND student_id=e.student_id AND essay_id=e.id AND NOT(entry_id=ANY(p_entry_ids));
 INSERT INTO student_story_essay_links(firm_id,student_id,entry_id,essay_id,created_by_user_id)
  SELECT p_firm,e.student_id,id,e.id,p_actor FROM unnest(p_entry_ids) id ON CONFLICT(entry_id,essay_id) DO NOTHING;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision) ORDER BY id),'[]'::jsonb) INTO refs FROM student_story_bank WHERE firm_id=p_firm AND student_id=e.student_id AND id=ANY(p_entry_ids);
 IF NOT public.essay_plan_sources_ready(p_firm,e.student_id,e.id,refs,false,p_review='confirmed') THEN RAISE EXCEPTION 'Refresh and confirm connected material first'; END IF;
 IF p_review='confirmed' AND (length(btrim(p_angle))=0 OR p_approach='exploring' OR (p_approach='experience' AND cardinality(p_entry_ids)=0)) THEN RAISE EXCEPTION 'Choose an approach, add an angle, and connect material for an experience response'; END IF;
 IF p_family AND (e.visibility_scope NOT IN ('family','firm') OR NOT public.essay_plan_sources_ready(p_firm,e.student_id,e.id,refs,true,true)) THEN RAISE EXCEPTION 'The essay and every connected source must be shared with family first'; END IF;
 SELECT revision+1 INTO next_revision FROM student_essay_plans WHERE firm_id=p_firm AND essay_id=e.id;
 IF next_revision IS NULL THEN
  next_revision:=1;
  INSERT INTO student_essay_plans(essay_id,firm_id,student_id,approach,angle,source_versions,review_state,family_shared,revision,created_by_user_id,updated_by_user_id)
   VALUES(e.id,p_firm,e.student_id,p_approach,btrim(p_angle),refs,p_review,p_family,1,p_actor,p_actor);
 ELSE
  UPDATE student_essay_plans SET approach=p_approach,angle=btrim(p_angle),source_versions=refs,review_state=p_review,family_shared=p_family,revision=next_revision,updated_at=now(),updated_by_user_id=p_actor
   WHERE firm_id=p_firm AND student_id=e.student_id AND essay_id=e.id;
 END IF;
 RETURN next_revision;
END $$;
REVOKE ALL ON FUNCTION public.essay_plan_sources_ready(uuid,uuid,uuid,jsonb,boolean,boolean),public.guard_essay_plan(),public.revisit_connected_essay_plan(),public.save_essay_plan(uuid,uuid,uuid,integer,uuid[],uuid[],text,text,text,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.essay_plan_sources_ready(uuid,uuid,uuid,jsonb,boolean,boolean),public.save_essay_plan(uuid,uuid,uuid,integer,uuid[],uuid[],text,text,text,boolean,jsonb) TO authenticated,service_role;
