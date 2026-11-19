-- Selected student evidence powers planning guidance, never essay writing.
-- No backfill, publication or change to existing essay audiences.
ALTER TABLE student_essay_plans ADD COLUMN ai_source_refs jsonb NOT NULL DEFAULT '[]';
ALTER TABLE student_essay_outlines ADD COLUMN ai_source_refs jsonb NOT NULL DEFAULT '[]';

CREATE FUNCTION public.essay_ai_sources(p_firm uuid,p_actor uuid,p_student uuid,p_family boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE r text; recipient uuid; family_only boolean; sources jsonb;
BEGIN
 r:=public.work_actor(p_firm,p_actor,p_student);
 IF r NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor','read_only_staff','student','parent_guardian') OR p_family IS NULL THEN RAISE EXCEPTION 'Student context access required'; END IF;
 family_only:=p_family OR r='parent_guardian';
 SELECT s.user_id INTO recipient FROM students s JOIN firm_memberships m ON m.firm_id=s.firm_id AND m.user_id=s.user_id AND m.role='student' AND m.status='active' WHERE s.firm_id=p_firm AND s.id=p_student;
 SELECT coalesce(jsonb_agg(x.source ORDER BY x.sort,x.id),'[]') INTO sources FROM (
  SELECT 1 sort,a.id,jsonb_build_object('kind','answer','id',a.id,'revision',a.revision,'stamp',md5(to_jsonb(a)::text),
   'label',a.question_key,'questionKey',a.question_key,'entryKind',NULL,'text',a.answer) source
  FROM student_interview_answers a WHERE a.firm_id=p_firm AND a.student_id=p_student AND a.respondent_user_id=recipient
   AND a.respondent_kind='student' AND public.interview_answer_active(a.firm_id,a.student_id,a.respondent_user_id,a.question_key,a.template_version) AND (NOT family_only OR a.audience='family') AND a.state IN ('answered','unsure') AND length(btrim(a.answer))>0
  UNION ALL
  SELECT 2,b.id,jsonb_build_object('kind','bank','id',b.id,'revision',b.revision,
   'stamp',md5((to_jsonb(b)||jsonb_build_object('support',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'revision',s.revision,'audience',s.audience,'review',s.review_state) ORDER BY s.id) FROM student_story_bank s WHERE s.firm_id=p_firm AND s.student_id=p_student AND s.id=ANY(b.story_ids)),'[]')))::text),
   'label',b.title,'questionKey',NULL,'entryKind',b.kind,'text',b.body||CASE WHEN b.reflection<>'' THEN E'\nReflection: '||b.reflection ELSE '' END)
  FROM student_story_bank b WHERE b.firm_id=p_firm AND b.student_id=p_student AND b.review_state='confirmed'
   AND (NOT family_only OR b.audience='family')
   AND (b.kind='story' OR (cardinality(b.story_ids)>0 AND cardinality(b.story_ids)=(SELECT count(*) FROM student_story_bank s WHERE s.firm_id=p_firm AND s.student_id=p_student AND s.id=ANY(b.story_ids) AND s.kind='story' AND s.review_state='confirmed' AND (NOT family_only OR s.audience='family'))))
  UNION ALL
  SELECT 3,s.id,jsonb_build_object('kind','strategy','id',s.id,'revision',s.revision,'stamp',md5(to_jsonb(s)::text),
   'label',s.section_key,'questionKey',NULL,'entryKind',NULL,'text',s.body||CASE WHEN s.student_note<>'' THEN E'\nStudent review note: '||s.student_note ELSE '' END)
  FROM student_strategy_sections s WHERE s.firm_id=p_firm AND s.student_id=p_student AND s.section_key<>'counselor_notes'
   AND s.publication_state='shared' AND s.student_review='accurate' AND (NOT family_only OR s.family_shared)
   AND public.strategy_sources_ready(p_firm,p_student,s.evidence,CASE WHEN family_only THEN 'family' ELSE 'student' END,true)
  UNION ALL
  SELECT 4,f.id,jsonb_build_object('kind','followup','id',f.id,'revision',f.revision,'stamp',md5(to_jsonb(f)::text),
   'label',f.question,'questionKey',NULL,'entryKind',NULL,'text','Question: '||f.question||E'\nRespondent reply: '||f.reply)
  FROM student_interview_followups f WHERE f.firm_id=p_firm AND f.student_id=p_student AND f.recipient_user_id=recipient AND (NOT family_only OR f.audience='family') AND length(btrim(f.reply))>0
 ) x;
 RETURN sources;
END $$;

CREATE FUNCTION public.essay_ai_sources_ready(p_firm uuid,p_actor uuid,p_student uuid,p_refs jsonb,p_family boolean,p_current boolean DEFAULT true)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE sources jsonb; ref jsonb; r text; recipient uuid; family_only boolean; visible boolean;
BEGIN
 IF jsonb_typeof(p_refs) IS DISTINCT FROM 'array' OR jsonb_array_length(p_refs)>20 OR p_current IS NULL OR p_family IS NULL THEN RETURN false; END IF;
 IF (SELECT count(DISTINCT (x->>'kind',x->>'id')) FROM jsonb_array_elements(p_refs) x)<>jsonb_array_length(p_refs) THEN RETURN false; END IF;
 r:=public.work_actor(p_firm,p_actor,p_student);
 IF r NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor','read_only_staff','student','parent_guardian') THEN RETURN false; END IF;
 family_only:=p_family OR r='parent_guardian';
 IF p_current OR family_only THEN sources:=public.essay_ai_sources(p_firm,p_actor,p_student,family_only);
 ELSE SELECT user_id INTO recipient FROM students WHERE firm_id=p_firm AND id=p_student; END IF;
 FOR ref IN SELECT value FROM jsonb_array_elements(p_refs) LOOP
  IF jsonb_typeof(ref) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(ref))<>4
   OR NOT(ref ?& ARRAY['kind','id','revision','stamp']) OR ref->>'stamp' !~ '^[a-f0-9]{32}$' OR ref->>'revision' !~ '^[1-9][0-9]*$' THEN RETURN false; END IF;
  IF p_current OR family_only THEN
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(sources) s WHERE jsonb_build_object('kind',s->'kind','id',s->'id','revision',s->'revision','stamp',s->'stamp')=ref) THEN RETURN false; END IF;
  ELSE
   -- Eligibility to generate/confirm differs from visibility of an existing
   -- working draft. A student's review flag must not hide their own writing.
   visible:=CASE ref->>'kind'
    WHEN 'answer' THEN EXISTS(SELECT 1 FROM student_interview_answers a WHERE a.firm_id=p_firm AND a.student_id=p_student AND a.id=(ref->>'id')::uuid AND a.respondent_kind='student' AND a.respondent_user_id=recipient)
    WHEN 'bank' THEN EXISTS(SELECT 1 FROM student_story_bank b WHERE b.firm_id=p_firm AND b.student_id=p_student AND b.id=(ref->>'id')::uuid)
    WHEN 'followup' THEN EXISTS(SELECT 1 FROM student_interview_followups f WHERE f.firm_id=p_firm AND f.student_id=p_student AND f.id=(ref->>'id')::uuid AND f.recipient_user_id=recipient)
    WHEN 'strategy' THEN EXISTS(SELECT 1 FROM student_strategy_sections s WHERE s.firm_id=p_firm AND s.student_id=p_student AND s.id=(ref->>'id')::uuid AND s.section_key<>'counselor_notes' AND s.publication_state='shared' AND public.strategy_sources_ready(p_firm,p_student,s.evidence,'student',false))
    ELSE false END;
   IF NOT visible THEN RETURN false; END IF;
  END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

-- A revision still visible to the writer may be kept as a private draft. Review
-- and family sharing always require the exact cited revision and audience.
CREATE FUNCTION public.guard_essay_ai_provenance() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r text;
BEGIN
 -- Legacy/manual material has no derived AI context. Its existing guards and
 -- save APIs keep their authorization/consent contract, including trusted seeds.
 IF NEW.ai_source_refs='[]'::jsonb AND (TG_OP='INSERT' OR OLD.ai_source_refs='[]'::jsonb) THEN RETURN NEW; END IF;
 r:=public.work_actor(NEW.firm_id,NEW.updated_by_user_id,NEW.student_id);
 IF r NOT IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Essay planning access required'; END IF;
 IF TG_OP='UPDATE' AND NEW.ai_source_refs=OLD.ai_source_refs AND NEW.review_state<>'confirmed' AND NOT NEW.family_shared THEN RETURN NEW; END IF;
 IF NOT public.essay_ai_sources_ready(NEW.firm_id,NEW.updated_by_user_id,NEW.student_id,NEW.ai_source_refs,false,true) THEN RAISE EXCEPTION 'Cited student context changed; review the sources before confirming'; END IF;
 IF NEW.family_shared AND NOT public.essay_ai_sources_ready(NEW.firm_id,NEW.updated_by_user_id,NEW.student_id,NEW.ai_source_refs,true,true) THEN RAISE EXCEPTION 'Every cited source must be current and shared with family first'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_essay_ai_provenance BEFORE INSERT OR UPDATE ON student_essay_plans FOR EACH ROW EXECUTE FUNCTION public.guard_essay_ai_provenance();
CREATE TRIGGER guard_essay_ai_provenance BEFORE INSERT OR UPDATE ON student_essay_outlines FOR EACH ROW EXECUTE FUNCTION public.guard_essay_ai_provenance();
CREATE POLICY essay_plan_ai_read ON student_essay_plans AS RESTRICTIVE FOR SELECT TO authenticated USING (
 public.is_staff() OR public.essay_ai_sources_ready(firm_id,public.current_user_id(),student_id,ai_source_refs,public.current_member_role()='parent_guardian',public.current_member_role()='parent_guardian'));
CREATE POLICY essay_outline_ai_read ON student_essay_outlines AS RESTRICTIVE FOR SELECT TO authenticated USING (
 public.is_staff() OR public.essay_ai_sources_ready(firm_id,public.current_user_id(),student_id,ai_source_refs,public.current_member_role()='parent_guardian',public.current_member_role()='parent_guardian'));

DROP FUNCTION public.save_essay_plan(uuid,uuid,uuid,integer,uuid[],uuid[],text,text,text,boolean,jsonb);
CREATE FUNCTION public.save_essay_plan(p_firm uuid,p_actor uuid,p_essay uuid,p_revision integer,p_expected_links uuid[],p_entry_ids uuid[],p_approach text,p_angle text,p_review text,p_family boolean,p_source_versions jsonb,p_ai_refs jsonb DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE e essay_drafts; previous student_essay_plans; r text; ai_refs jsonb; actual_ids uuid[]; refs jsonb; next_revision integer;
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
 ai_refs:=coalesce(p_ai_refs,previous.ai_source_refs,'[]'::jsonb);
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
 IF NOT (previous.ai_source_refs IS NOT DISTINCT FROM ai_refs AND p_review<>'confirmed' AND NOT p_family) AND NOT public.essay_ai_sources_ready(p_firm,p_actor,e.student_id,ai_refs,false,true) THEN RAISE EXCEPTION 'Cited student context changed; review the sources before confirming'; END IF;
 IF p_family AND NOT public.essay_ai_sources_ready(p_firm,p_actor,e.student_id,ai_refs,true,true) THEN RAISE EXCEPTION 'Every cited source must be current and shared with family first'; END IF;
 SELECT revision+1 INTO next_revision FROM student_essay_plans WHERE firm_id=p_firm AND essay_id=e.id;
 IF next_revision IS NULL THEN
  next_revision:=1;
  INSERT INTO student_essay_plans(essay_id,firm_id,student_id,approach,angle,source_versions,ai_source_refs,review_state,family_shared,revision,created_by_user_id,updated_by_user_id)
   VALUES(e.id,p_firm,e.student_id,p_approach,btrim(p_angle),refs,ai_refs,p_review,p_family,1,p_actor,p_actor);
 ELSE
  UPDATE student_essay_plans SET approach=p_approach,angle=btrim(p_angle),source_versions=refs,ai_source_refs=ai_refs,review_state=p_review,family_shared=p_family,revision=next_revision,updated_at=now(),updated_by_user_id=p_actor
   WHERE firm_id=p_firm AND student_id=e.student_id AND essay_id=e.id;
 END IF;
 RETURN next_revision;
END $$;

DROP FUNCTION public.save_essay_outline(uuid,uuid,uuid,integer,jsonb,jsonb,text,boolean);
CREATE FUNCTION public.save_essay_outline(p_firm uuid,p_actor uuid,p_essay uuid,p_revision integer,p_content jsonb,p_context jsonb,p_review text,p_family boolean,p_ai_refs jsonb DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE e essay_drafts; previous student_essay_outlines; r text; ai_refs jsonb; expected jsonb; result integer;
BEGIN
 SELECT * INTO e FROM essay_drafts WHERE id=p_essay AND firm_id=p_firm FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Essay not found'; END IF;
 r:=public.work_actor(p_firm,p_actor,e.student_id);
 IF r NOT IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor') OR (r='student' AND e.visibility_scope NOT IN ('student','family','firm')) THEN RAISE EXCEPTION 'Outline editing access required'; END IF;
 SELECT * INTO previous FROM student_essay_outlines WHERE firm_id=p_firm AND essay_id=e.id FOR UPDATE;
 ai_refs:=coalesce(p_ai_refs,previous.ai_source_refs,(SELECT ai_source_refs FROM student_essay_plans WHERE firm_id=p_firm AND essay_id=e.id),'[]'::jsonb);
 IF EXISTS(SELECT 1 FROM student_essay_plans p WHERE p.firm_id=p_firm AND p.essay_id=e.id AND NOT(ai_refs @> p.ai_source_refs)) THEN RAISE EXCEPTION 'Include the response plan cited context'; END IF;
 IF p_revision IS NULL OR coalesce(previous.revision,0)<>p_revision THEN RAISE EXCEPTION 'Outline changed in another window'; END IF;
 PERFORM b.id FROM student_story_bank b JOIN student_story_essay_links l ON l.entry_id=b.id AND l.firm_id=p_firm AND l.essay_id=e.id WHERE b.firm_id=p_firm ORDER BY b.id FOR SHARE OF b;
 expected:=public.essay_outline_context(p_firm,e.id);
 IF p_context IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Planning context changed in another window'; END IF;
 IF p_review IS NULL OR p_review NOT IN ('draft','confirmed','revisit') OR p_family IS NULL OR NOT public.essay_outline_content_valid(p_content,p_context,p_review='confirmed') THEN RAISE EXCEPTION 'Check the outline purpose, sections and connected material'; END IF;
 IF r<>'student' AND (p_review<>'draft' OR p_family) THEN RAISE EXCEPTION 'Student reviews outlines and approves parent sharing'; END IF;
 IF NOT public.essay_plan_sources_ready(p_firm,e.student_id,e.id,p_context->'source_versions',false,p_review='confirmed') THEN RAISE EXCEPTION 'Review connected material first'; END IF;
 IF p_review='confirmed' AND EXISTS(SELECT 1 FROM student_essay_plans p WHERE p.firm_id=p_firm AND p.essay_id=e.id AND (p.review_state<>'confirmed' OR NOT public.essay_plan_sources_ready(p_firm,e.student_id,e.id,p.source_versions,false,true))) THEN RAISE EXCEPTION 'Review the response plan first'; END IF;
 IF p_family AND (p_review<>'confirmed' OR NOT public.essay_outline_shareable(p_firm,e.student_id,e.id,p_context)) THEN RAISE EXCEPTION 'The essay, plan and connected material must be shared with family first'; END IF;
 IF NOT (previous.ai_source_refs IS NOT DISTINCT FROM ai_refs AND p_review<>'confirmed' AND NOT p_family) AND NOT public.essay_ai_sources_ready(p_firm,p_actor,e.student_id,ai_refs,false,true) THEN RAISE EXCEPTION 'Cited student context changed; review the sources before confirming'; END IF;
 IF p_family AND NOT public.essay_ai_sources_ready(p_firm,p_actor,e.student_id,ai_refs,true,true) THEN RAISE EXCEPTION 'Every cited source must be current and shared with family first'; END IF;
 result:=coalesce(previous.revision,0)+1;
 IF previous.essay_id IS NULL THEN
  INSERT INTO student_essay_outlines(essay_id,firm_id,student_id,content,context_versions,ai_source_refs,review_state,family_shared,created_by_user_id,updated_by_user_id) VALUES(e.id,p_firm,e.student_id,p_content,p_context,ai_refs,p_review,p_family,p_actor,p_actor);
 ELSE
  UPDATE student_essay_outlines SET content=p_content,context_versions=p_context,ai_source_refs=ai_refs,review_state=p_review,family_shared=p_family,revision=result,updated_at=now(),updated_by_user_id=p_actor WHERE firm_id=p_firm AND essay_id=e.id;
 END IF;
 RETURN result;
END $$;

-- The signature includes assigned requirements, connected material, plan and
-- outline revisions. A response cannot overwrite work changed during generation.
CREATE FUNCTION public.essay_ai_task_stamp(p_firm uuid,p_actor uuid,p_essay uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE e essay_drafts; r text; result text;
BEGIN
 SELECT * INTO e FROM essay_drafts WHERE firm_id=p_firm AND id=p_essay;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Essay not found'; END IF;
 r:=public.work_actor(p_firm,p_actor,e.student_id);
 IF r NOT IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor') OR (r='student' AND e.visibility_scope NOT IN ('student','family','firm')) THEN RAISE EXCEPTION 'Essay planning access required'; END IF;
 SELECT md5(jsonb_build_object('context',public.essay_outline_context(p_firm,e.id),'visibility',e.visibility_scope,
  'plan',(SELECT to_jsonb(p) FROM student_essay_plans p WHERE p.firm_id=p_firm AND p.essay_id=e.id),
  'outline',(SELECT revision FROM student_essay_outlines WHERE firm_id=p_firm AND essay_id=e.id))::text) INTO result;
 RETURN result;
END $$;

CREATE TABLE essay_ai_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),firm_id uuid NOT NULL REFERENCES firms(id),student_id uuid NOT NULL REFERENCES students(id),
 essay_id uuid NOT NULL REFERENCES essay_drafts(id) ON DELETE CASCADE,owner_user_id uuid NOT NULL REFERENCES users(id),
 mode text NOT NULL CHECK(mode IN ('story_matches','outline')),source_refs jsonb NOT NULL,
 task_stamp text NOT NULL CHECK(task_stamp ~ '^[a-f0-9]{32}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','failed','dismissed','accepted')),
 result jsonb,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(jsonb_typeof(source_refs)='array' AND jsonb_array_length(source_refs) BETWEEN 1 AND 20),
 CHECK(result IS NULL OR (jsonb_typeof(result)='object' AND length(result::text)<=30000)),CHECK(status NOT IN ('ready','accepted') OR result IS NOT NULL)
);
CREATE INDEX essay_ai_requests_owner ON essay_ai_requests(firm_id,owner_user_id,essay_id,created_at DESC);
CREATE INDEX essay_ai_requests_student ON essay_ai_requests(student_id);
ALTER TABLE essay_ai_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON essay_ai_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON essay_ai_requests TO authenticated,service_role;
GRANT DELETE ON essay_ai_requests TO service_role;
CREATE POLICY essay_ai_read ON essay_ai_requests FOR SELECT TO authenticated USING (
 owner_user_id=public.current_user_id() AND public.interview_can_write_bank(firm_id,student_id)
 AND public.essay_ai_sources_ready(firm_id,owner_user_id,student_id,source_refs,false,true)
 AND task_stamp=public.essay_ai_task_stamp(firm_id,owner_user_id,essay_id));
CREATE POLICY essay_ai_insert ON essay_ai_requests FOR INSERT TO authenticated WITH CHECK(owner_user_id=public.current_user_id() AND public.interview_can_write_bank(firm_id,student_id));
CREATE POLICY essay_ai_update ON essay_ai_requests FOR UPDATE TO authenticated USING(owner_user_id=public.current_user_id() AND public.interview_can_write_bank(firm_id,student_id)) WITH CHECK(owner_user_id=public.current_user_id() AND public.interview_can_write_bank(firm_id,student_id));

-- Count even failed/withdrawn requests without retaining source text in the quota
-- ledger. Interview and essay requests share the established per-user allowance.
CREATE TABLE essay_ai_request_usage (
 request_id uuid PRIMARY KEY REFERENCES essay_ai_requests(id) ON DELETE CASCADE,firm_id uuid NOT NULL REFERENCES firms(id),
 owner_user_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX essay_ai_usage_owner ON essay_ai_request_usage(firm_id,owner_user_id,created_at);
ALTER TABLE essay_ai_request_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON essay_ai_request_usage FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON essay_ai_request_usage TO authenticated,service_role;
GRANT DELETE ON essay_ai_request_usage TO service_role;
CREATE POLICY essay_ai_usage_read ON essay_ai_request_usage FOR SELECT TO authenticated USING(firm_id=public.firm_id() AND owner_user_id=public.current_user_id());
CREATE POLICY essay_ai_usage_insert ON essay_ai_request_usage FOR INSERT TO authenticated WITH CHECK(firm_id=public.firm_id() AND owner_user_id=public.current_user_id());
CREATE TRIGGER guard_essay_ai_usage BEFORE INSERT ON essay_ai_request_usage FOR EACH ROW EXECUTE FUNCTION public.guard_student_ai_usage();
CREATE FUNCTION public.student_ai_quota_available(p_firm uuid,p_actor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT count(*) FILTER(WHERE created_at>now()-interval '1 hour')<10 AND count(*)<40 FROM (
  SELECT created_at FROM student_ai_request_usage WHERE firm_id=p_firm AND owner_user_id=p_actor AND created_at>now()-interval '24 hours'
  UNION ALL SELECT created_at FROM essay_ai_request_usage WHERE firm_id=p_firm AND owner_user_id=p_actor AND created_at>now()-interval '24 hours'
 ) usage;
$$;
CREATE FUNCTION public.guard_essay_ai_request() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r text; e essay_drafts; plan student_essay_plans;
BEGIN
 r:=public.work_actor(NEW.firm_id,NEW.owner_user_id,NEW.student_id);
 SELECT * INTO e FROM essay_drafts WHERE firm_id=NEW.firm_id AND student_id=NEW.student_id AND id=NEW.essay_id;
 IF e.id IS NULL OR r NOT IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor') OR (r='student' AND e.visibility_scope NOT IN ('student','family','firm')) THEN RAISE EXCEPTION 'Essay planning access required'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.id,NEW.firm_id,NEW.student_id,NEW.essay_id,NEW.owner_user_id,NEW.mode,NEW.source_refs,NEW.task_stamp,NEW.created_at) IS DISTINCT FROM
   (OLD.id,OLD.firm_id,OLD.student_id,OLD.essay_id,OLD.owner_user_id,OLD.mode,OLD.source_refs,OLD.task_stamp,OLD.created_at) THEN RAISE EXCEPTION 'AI request identity cannot change'; END IF;
  IF (OLD.status='pending' AND NEW.status NOT IN ('ready','failed')) OR (OLD.status='ready' AND NEW.status NOT IN ('accepted','dismissed')) OR OLD.status NOT IN ('pending','ready')
   OR (OLD.status='ready' AND NEW.result IS DISTINCT FROM OLD.result) THEN RAISE EXCEPTION 'Suggestion already used or unavailable'; END IF;
  -- Failure/dismissal can always remove access after source withdrawal.
  IF NEW.status IN ('failed','dismissed') THEN RETURN NEW; END IF;
 ELSE
  IF NEW.status<>'pending' OR NEW.result IS NOT NULL THEN RAISE EXCEPTION 'New AI requests start pending'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.firm_id::text||NEW.owner_user_id::text,641));
  IF NOT public.student_ai_quota_available(NEW.firm_id,NEW.owner_user_id) THEN RAISE EXCEPTION 'AI request limit reached; please try again later'; END IF;
  NEW.created_at:=now();
 END IF;
 IF NOT public.essay_ai_sources_ready(NEW.firm_id,NEW.owner_user_id,NEW.student_id,NEW.source_refs,false,true)
  OR NEW.task_stamp IS DISTINCT FROM public.essay_ai_task_stamp(NEW.firm_id,NEW.owner_user_id,NEW.essay_id) THEN RAISE EXCEPTION 'Essay or cited context changed; refresh before continuing'; END IF;
 IF NEW.mode='story_matches' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.source_refs) ref WHERE ref->>'kind'='bank') THEN RAISE EXCEPTION 'Choose confirmed stories or narratives first'; END IF;
 IF NEW.mode='outline' THEN
  SELECT * INTO plan FROM student_essay_plans WHERE firm_id=NEW.firm_id AND essay_id=e.id;
  IF plan.essay_id IS NULL OR plan.approach='exploring' OR length(btrim(plan.angle))=0 OR NOT(NEW.source_refs @> plan.ai_source_refs)
   OR NOT public.essay_plan_sources_ready(NEW.firm_id,NEW.student_id,e.id,plan.source_versions,false,true)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(plan.source_versions) ref WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.source_refs) s WHERE s->>'kind'='bank' AND s->>'id'=ref->>'id'))
   THEN RAISE EXCEPTION 'Save an angle and select its confirmed connected material and cited context first'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_essay_ai_request BEFORE INSERT OR UPDATE ON essay_ai_requests FOR EACH ROW EXECUTE FUNCTION public.guard_essay_ai_request();
CREATE FUNCTION public.record_essay_ai_usage() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 INSERT INTO essay_ai_request_usage(request_id,firm_id,owner_user_id) VALUES(NEW.id,NEW.firm_id,NEW.owner_user_id);RETURN NULL;
END $$;
CREATE TRIGGER record_essay_ai_usage AFTER INSERT ON essay_ai_requests FOR EACH ROW EXECUTE FUNCTION public.record_essay_ai_usage();

CREATE FUNCTION public.accept_essay_ai_suggestion(p_firm uuid,p_actor uuid,p_request uuid,p_index integer,p_angle text,p_content jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE req essay_ai_requests; e essay_drafts; plan student_essay_plans; outline student_essay_outlines; ids uuid[]; links uuid[]; refs jsonb; result integer; item jsonb;
BEGIN
 -- Match the essay -> request lock order to manual document saves.
 SELECT essay_id INTO e.id FROM essay_ai_requests WHERE firm_id=p_firm AND owner_user_id=p_actor AND id=p_request;
 PERFORM id FROM essay_drafts WHERE firm_id=p_firm AND id=e.id FOR UPDATE;
 SELECT * INTO req FROM essay_ai_requests WHERE firm_id=p_firm AND owner_user_id=p_actor AND id=p_request FOR UPDATE;
 IF req.id IS NULL OR req.status<>'ready' THEN RAISE EXCEPTION 'Suggestion already used or unavailable'; END IF;
 PERFORM public.work_actor(p_firm,p_actor,req.student_id);
 -- The trigger rechecks assignment, sources and task signature atomically.
 UPDATE essay_ai_requests SET status='accepted' WHERE firm_id=p_firm AND id=req.id;
 SELECT * INTO plan FROM student_essay_plans WHERE firm_id=p_firm AND essay_id=req.essay_id;
 IF req.mode='story_matches' THEN
  IF p_index IS NULL OR p_index<0 OR p_index>3 THEN RAISE EXCEPTION 'Choose a story suggestion'; END IF;
  item:=req.result->'matches'->p_index;
  IF item IS NULL OR jsonb_typeof(item->'entryIds') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Choose a story suggestion'; END IF;
  SELECT array_agg(value::uuid) INTO ids FROM jsonb_array_elements_text(item->'entryIds');
  IF coalesce(cardinality(ids),0)=0 OR EXISTS(SELECT 1 FROM unnest(ids) id WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(req.source_refs) s WHERE s->>'kind'='bank' AND s->>'id'=id::text)) THEN RAISE EXCEPTION 'Choose cited story material'; END IF;
  SELECT coalesce(array_agg(entry_id),'{}') INTO links FROM student_story_essay_links WHERE firm_id=p_firm AND student_id=req.student_id AND essay_id=req.essay_id;
  SELECT jsonb_agg(jsonb_build_object('id',id,'revision',revision) ORDER BY id) INTO refs FROM student_story_bank WHERE firm_id=p_firm AND student_id=req.student_id AND id=ANY(ids);
  result:=public.save_essay_plan(p_firm,p_actor,req.essay_id,coalesce(plan.revision,0),links,ids,'experience',p_angle,'draft',false,refs,req.source_refs);
 ELSE
  SELECT * INTO outline FROM student_essay_outlines WHERE firm_id=p_firm AND essay_id=req.essay_id;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_content->'beats') beat CROSS JOIN LATERAL jsonb_array_elements_text(beat->'entry_ids') id WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(req.source_refs) s WHERE s->>'kind'='bank' AND s->>'id'=id)) THEN RAISE EXCEPTION 'Use the selected connected material'; END IF;
  result:=public.save_essay_outline(p_firm,p_actor,req.essay_id,coalesce(outline.revision,0),p_content,public.essay_outline_context(p_firm,req.essay_id),'draft',false,req.source_refs);
 END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.guard_student_ai_request() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r text; target text; context jsonb; ref jsonb; source jsonb;
BEGIN
 r:=public.work_actor(NEW.firm_id,NEW.owner_user_id,NEW.student_id);
 context:=public.student_ai_context(NEW.firm_id,NEW.owner_user_id,NEW.student_id,NEW.recipient_user_id);target:=context->>'recipientKind';
 IF NEW.mode<>'questions' AND target<>'student' THEN RAISE EXCEPTION 'Parent assistance supports their own interview'; END IF;
 IF NEW.mode='strategy' AND r NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Counselors draft strategy sections'; END IF;
 IF NOT public.student_ai_result_current(NEW.firm_id,NEW.owner_user_id,NEW.student_id,NEW.recipient_user_id,NEW.source_refs,NEW.mode,NEW.result) THEN RAISE EXCEPTION 'AI context changed; refresh before continuing'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'pending' OR NEW.result IS NOT NULL OR cardinality(NEW.used_indices)<>0 THEN RAISE EXCEPTION 'New AI requests start pending'; END IF;
  IF NEW.mode<>'questions' AND jsonb_array_length(NEW.source_refs)=0 THEN RAISE EXCEPTION 'Choose supporting material first'; END IF;
  FOR ref IN SELECT value FROM jsonb_array_elements(NEW.source_refs) LOOP
   SELECT s INTO source FROM jsonb_array_elements(context->'sources') s WHERE s->>'kind'=ref->>'kind' AND s->>'id'=ref->>'id';
   IF (NEW.mode='story' AND ref->>'kind'<>'answer') OR (NEW.mode='narrative' AND (ref->>'kind'<>'bank' OR source->>'entryKind'<>'story'))
    OR (NEW.mode='strategy' AND ref->>'kind' NOT IN ('answer','bank')) THEN RAISE EXCEPTION 'Choose appropriate sources for this request'; END IF;
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.firm_id::text||NEW.owner_user_id::text,641));
  IF NOT public.student_ai_quota_available(NEW.firm_id,NEW.owner_user_id)
  THEN RAISE EXCEPTION 'AI request limit reached; please try again later'; END IF;
  NEW.created_at:=now();
 ELSE
  IF (NEW.id,NEW.firm_id,NEW.student_id,NEW.owner_user_id,NEW.recipient_user_id,NEW.mode,NEW.source_refs,NEW.created_at) IS DISTINCT FROM
   (OLD.id,OLD.firm_id,OLD.student_id,OLD.owner_user_id,OLD.recipient_user_id,OLD.mode,OLD.source_refs,OLD.created_at) THEN RAISE EXCEPTION 'AI request identity cannot change'; END IF;
  IF OLD.status NOT IN ('pending','ready') OR (OLD.status='pending' AND NEW.status NOT IN ('ready','failed')) OR (OLD.status='ready' AND NEW.status NOT IN ('ready','dismissed'))
   OR (OLD.status='ready' AND NEW.result IS DISTINCT FROM OLD.result) OR NOT NEW.used_indices @> OLD.used_indices
  THEN RAISE EXCEPTION 'Invalid AI request transition'; END IF;
 END IF;
 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.essay_ai_sources(uuid,uuid,uuid,boolean),public.essay_ai_sources_ready(uuid,uuid,uuid,jsonb,boolean,boolean),public.essay_ai_task_stamp(uuid,uuid,uuid),public.student_ai_quota_available(uuid,uuid),public.accept_essay_ai_suggestion(uuid,uuid,uuid,integer,text,jsonb),public.save_essay_plan(uuid,uuid,uuid,integer,uuid[],uuid[],text,text,text,boolean,jsonb,jsonb),public.save_essay_outline(uuid,uuid,uuid,integer,jsonb,jsonb,text,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.essay_ai_sources(uuid,uuid,uuid,boolean),public.essay_ai_sources_ready(uuid,uuid,uuid,jsonb,boolean,boolean),public.essay_ai_task_stamp(uuid,uuid,uuid),public.student_ai_quota_available(uuid,uuid),public.accept_essay_ai_suggestion(uuid,uuid,uuid,integer,text,jsonb),public.save_essay_plan(uuid,uuid,uuid,integer,uuid[],uuid[],text,text,text,boolean,jsonb,jsonb),public.save_essay_outline(uuid,uuid,uuid,integer,jsonb,jsonb,text,boolean,jsonb) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.guard_essay_ai_provenance(),public.guard_essay_ai_request(),public.record_essay_ai_usage() FROM PUBLIC,anon,authenticated;
