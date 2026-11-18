-- Counselor synthesis has its own audience. Referencing a source never widens
-- that source's permissions or copies its private original text.
CREATE FUNCTION public.strategy_sources_ready(p_firm uuid,p_student uuid,p_refs jsonb,p_audience text,p_current boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE ref jsonb; a student_interview_answers; b student_story_bank;
BEGIN
 IF coalesce(p_audience,'') NOT IN ('staff','student','family') OR jsonb_typeof(p_refs) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(p_refs)>20 THEN RETURN false; END IF;
 FOR ref IN SELECT value FROM jsonb_array_elements(p_refs) LOOP
  IF jsonb_typeof(ref) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF NOT (ref ?& ARRAY['kind','id','revision'])
   OR (SELECT count(*) FROM jsonb_object_keys(ref))<>3
   OR coalesce(ref->>'kind','') NOT IN ('answer','bank')
   OR jsonb_typeof(ref->'id') IS DISTINCT FROM 'string'
   OR jsonb_typeof(ref->'revision') IS DISTINCT FROM 'number'
   OR coalesce(ref->>'revision','') !~ '^[1-9][0-9]*$'
  THEN RETURN false; END IF;
  IF ref->>'kind'='answer' THEN
   SELECT * INTO a FROM student_interview_answers WHERE id=(ref->>'id')::uuid AND firm_id=p_firm AND student_id=p_student;
   IF NOT FOUND OR (p_current AND a.revision<>(ref->>'revision')::integer)
    OR (p_audience='student' AND a.respondent_kind<>'student' AND a.audience<>'family')
    OR (p_audience='family' AND a.audience<>'family') THEN RETURN false; END IF;
  ELSE
   SELECT * INTO b FROM student_story_bank WHERE id=(ref->>'id')::uuid AND firm_id=p_firm AND student_id=p_student;
   IF NOT FOUND OR (p_current AND b.revision<>(ref->>'revision')::integer)
    OR (p_audience='family' AND (b.audience<>'family' OR b.review_state<>'confirmed'
      OR (b.kind='narrative' AND NOT public.interview_family_evidence(p_firm,p_student,b.story_ids)))) THEN RETURN false; END IF;
  END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $$;

CREATE TABLE student_strategy_sections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 firm_id uuid NOT NULL REFERENCES firms(id),student_id uuid NOT NULL REFERENCES students(id),
 section_key text NOT NULL CHECK(section_key IN ('priorities','constraints','strengths','narratives','alignment','next_steps','counselor_notes')),
 body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 12000),
 evidence jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(evidence)='array' AND jsonb_array_length(evidence)<=20),
 publication_state text NOT NULL CHECK(publication_state IN ('draft','shared')),
 student_review text NOT NULL DEFAULT 'pending' CHECK(student_review IN ('pending','accurate','discuss')),
 student_note text NOT NULL DEFAULT '' CHECK(length(student_note)<=3000),
 family_shared boolean NOT NULL DEFAULT false,reviewed_at timestamptz,
 created_by_user_id uuid NOT NULL REFERENCES users(id),updated_by_user_id uuid NOT NULL REFERENCES users(id),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(firm_id,student_id,section_key),
 CHECK(NOT family_shared OR (student_review='accurate' AND publication_state='shared')),
 CHECK(section_key<>'counselor_notes' OR publication_state='draft')
);
ALTER TABLE student_strategy_sections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON student_strategy_sections FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON student_strategy_sections TO authenticated;
GRANT ALL ON student_strategy_sections TO service_role;

CREATE POLICY strategy_sections_read ON student_strategy_sections FOR SELECT TO authenticated USING (
 public.interview_can_access(firm_id,student_id) AND (
  public.is_staff() OR (publication_state='shared' AND section_key<>'counselor_notes' AND (
   (public.current_member_role()='student' AND public.strategy_sources_ready(firm_id,student_id,evidence,'student',false))
   OR (public.current_member_role()='parent_guardian' AND family_shared AND student_review='accurate'
     AND public.strategy_sources_ready(firm_id,student_id,evidence,'family',true))
  ))
 ));
CREATE POLICY strategy_sections_insert ON student_strategy_sections FOR INSERT TO authenticated WITH CHECK (
 public.interview_can_access(firm_id,student_id) AND public.current_member_role() IN ('firm_owner','firm_admin','counselor','essay_coach','tutor')
 AND created_by_user_id=public.current_user_id());
CREATE POLICY strategy_sections_update ON student_strategy_sections FOR UPDATE TO authenticated USING (
 public.interview_can_access(firm_id,student_id) AND public.current_member_role() IN ('firm_owner','firm_admin','counselor','essay_coach','tutor','student')) WITH CHECK (
 public.interview_can_access(firm_id,student_id) AND public.current_member_role() IN ('firm_owner','firm_admin','counselor','essay_coach','tutor','student'));

CREATE FUNCTION public.guard_strategy_section() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r text;
BEGIN
 IF current_user IN ('postgres','service_role') THEN RETURN NEW; END IF;
 r:=public.work_actor(NEW.firm_id,public.current_user_id(),NEW.student_id);
 IF NEW.updated_by_user_id IS DISTINCT FROM public.current_user_id() THEN RAISE EXCEPTION 'Invalid strategy editor'; END IF;
 IF TG_OP='INSERT' THEN
  IF r NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') OR NEW.created_by_user_id IS DISTINCT FROM public.current_user_id()
   OR NEW.revision<>1 OR NEW.publication_state<>'draft' THEN RAISE EXCEPTION 'Start with a counselor-only draft'; END IF;
 ELSE
  IF (NEW.id,NEW.firm_id,NEW.student_id,NEW.section_key,NEW.created_by_user_id)
   IS DISTINCT FROM (OLD.id,OLD.firm_id,OLD.student_id,OLD.section_key,OLD.created_by_user_id) THEN RAISE EXCEPTION 'Strategy identity cannot change'; END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Strategy changed; reload before saving'; END IF;
 END IF;
 IF r IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') THEN
  -- Every counselor save asks the student to review the current section again.
  IF NEW.student_review<>'pending' OR NEW.family_shared
   OR (TG_OP='INSERT' AND (NEW.student_note<>'' OR NEW.reviewed_at IS NOT NULL))
   OR (TG_OP='UPDATE' AND (NEW.student_note,NEW.reviewed_at) IS DISTINCT FROM (OLD.student_note,OLD.reviewed_at))
   THEN RAISE EXCEPTION 'Student reviews and approves parent sharing'; END IF;
  IF NOT public.strategy_sources_ready(NEW.firm_id,NEW.student_id,NEW.evidence,'staff',true)
   THEN RAISE EXCEPTION 'Refresh the linked sources before saving'; END IF;
  IF NEW.publication_state='shared' AND NOT public.strategy_sources_ready(NEW.firm_id,NEW.student_id,NEW.evidence,'student',true)
   THEN RAISE EXCEPTION 'Private parent responses must stay in counselor-only drafts'; END IF;
 ELSIF r='student' AND TG_OP='UPDATE' THEN
  IF OLD.publication_state<>'shared' OR (NEW.body,NEW.evidence,NEW.publication_state) IS DISTINCT FROM (OLD.body,OLD.evidence,OLD.publication_state)
   THEN RAISE EXCEPTION 'Only the counseling team edits the brief'; END IF;
  IF NEW.student_review='accurate' AND NOT public.strategy_sources_ready(NEW.firm_id,NEW.student_id,NEW.evidence,'student',true)
   THEN RAISE EXCEPTION 'Ask your counselor to refresh the changed sources first'; END IF;
  IF NEW.family_shared AND (NEW.student_review<>'accurate' OR NOT public.strategy_sources_ready(NEW.firm_id,NEW.student_id,NEW.evidence,'family',true))
   THEN RAISE EXCEPTION 'Confirm the section and share its linked sources before sharing with parents'; END IF;
  NEW.reviewed_at:=CASE WHEN NEW.student_review='pending' THEN NULL ELSE now() END;
 ELSE RAISE EXCEPTION 'Strategy editing access required'; END IF;
 NEW.updated_at:=now();RETURN NEW;
END $$;
CREATE TRIGGER guard_strategy_section BEFORE INSERT OR UPDATE ON student_strategy_sections FOR EACH ROW EXECUTE FUNCTION public.guard_strategy_section();
REVOKE ALL ON FUNCTION public.strategy_sources_ready(uuid,uuid,jsonb,text,boolean),public.guard_strategy_section() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.strategy_sources_ready(uuid,uuid,jsonb,text,boolean) TO authenticated,service_role;
