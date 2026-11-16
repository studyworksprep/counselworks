-- On-demand AI context is bounded by its intended respondent, not the staff
-- requester's broader access. Private counselor notes and raw story snapshots
-- never enter this context. All routines remain SECURITY INVOKER.
CREATE FUNCTION public.student_ai_context(p_firm uuid,p_actor uuid,p_student uuid,p_recipient uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE r text; target text; sources jsonb; excluded jsonb;
BEGIN
 r:=public.work_actor(p_firm,p_actor,p_student);
 IF r NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor','student','parent_guardian')
  OR (r IN ('student','parent_guardian') AND p_actor IS DISTINCT FROM p_recipient)
 THEN RAISE EXCEPTION 'AI interview access required'; END IF;
 SELECT CASE WHEN s.user_id=p_recipient AND m.role='student' THEN 'student' ELSE 'parent' END INTO target
 FROM students s JOIN firm_memberships m ON m.firm_id=s.firm_id AND m.user_id=p_recipient AND m.status='active'
 WHERE s.id=p_student AND s.firm_id=p_firm AND ((s.user_id=p_recipient AND m.role='student') OR (m.role='parent_guardian' AND EXISTS(
  SELECT 1 FROM family_members f WHERE f.firm_id=p_firm AND f.family_id=s.family_id AND f.user_id=p_recipient)));
 IF target IS NULL THEN RAISE EXCEPTION 'Choose an active interview respondent'; END IF;
 SELECT coalesce(jsonb_agg(x.source ORDER BY x.sort,x.id),'[]') INTO sources FROM (
  SELECT 1 sort,a.id,jsonb_build_object('kind','answer','id',a.id,'revision',a.revision,'stamp',md5(to_jsonb(a)::text),
   'label',a.question_key,'questionKey',a.question_key,'entryKind',NULL,'text',a.answer) source
  FROM student_interview_answers a WHERE a.firm_id=p_firm AND a.student_id=p_student AND a.respondent_user_id=p_recipient
   AND a.respondent_kind=target AND a.state IN ('answered','unsure') AND length(btrim(a.answer))>0
  UNION ALL
  SELECT 2,b.id,jsonb_build_object('kind','bank','id',b.id,'revision',b.revision,
   'stamp',md5((to_jsonb(b)||jsonb_build_object('support',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'revision',s.revision,'audience',s.audience,'review',s.review_state) ORDER BY s.id) FROM student_story_bank s WHERE s.firm_id=p_firm AND s.student_id=p_student AND s.id=ANY(b.story_ids)),'[]')))::text),
   'label',b.title,'questionKey',NULL,'entryKind',b.kind,'text',b.body||CASE WHEN b.reflection<>'' THEN E'\nReflection: '||b.reflection ELSE '' END)
  FROM student_story_bank b WHERE b.firm_id=p_firm AND b.student_id=p_student AND b.review_state='confirmed'
   AND (target='student' OR b.audience='family')
   AND (b.kind='story' OR (cardinality(b.story_ids)>0 AND cardinality(b.story_ids)=(SELECT count(*) FROM student_story_bank s WHERE s.firm_id=p_firm AND s.student_id=p_student AND s.id=ANY(b.story_ids) AND s.kind='story' AND s.review_state='confirmed' AND (target='student' OR s.audience='family'))))
  UNION ALL
  SELECT 3,s.id,jsonb_build_object('kind','strategy','id',s.id,'revision',s.revision,'stamp',md5(to_jsonb(s)::text),
   'label',s.section_key,'questionKey',NULL,'entryKind',NULL,'text',s.body||CASE WHEN s.student_note<>'' THEN E'\nStudent review note: '||s.student_note ELSE '' END)
  FROM student_strategy_sections s WHERE s.firm_id=p_firm AND s.student_id=p_student AND s.section_key<>'counselor_notes'
   AND s.publication_state='shared' AND s.student_review='accurate' AND (target='student' OR s.family_shared)
   AND public.strategy_sources_ready(p_firm,p_student,s.evidence,CASE WHEN target='student' THEN 'student' ELSE 'family' END,true)
  UNION ALL
  SELECT 4,f.id,jsonb_build_object('kind','followup','id',f.id,'revision',f.revision,'stamp',md5(to_jsonb(f)::text),
   'label',f.question,'questionKey',NULL,'entryKind',NULL,'text','Question: '||f.question||E'\nRespondent reply: '||f.reply)
  FROM student_interview_followups f WHERE f.firm_id=p_firm AND f.student_id=p_student AND f.recipient_user_id=p_recipient AND length(btrim(f.reply))>0
 ) x;
 SELECT coalesce(jsonb_agg(question_key ORDER BY question_key),'[]') INTO excluded FROM student_interview_answers
 WHERE firm_id=p_firm AND student_id=p_student AND respondent_user_id=p_recipient AND state IN ('skip','discuss');
 RETURN jsonb_build_object('recipientKind',target,'sources',sources,'excludedQuestionKeys',excluded);
END $$;

CREATE FUNCTION public.student_ai_sources_current(p_firm uuid,p_actor uuid,p_student uuid,p_recipient uuid,p_refs jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE context jsonb; ref jsonb;
BEGIN
 IF jsonb_typeof(p_refs) IS DISTINCT FROM 'array' OR jsonb_array_length(p_refs)>20 THEN RETURN false; END IF;
 context:=public.student_ai_context(p_firm,p_actor,p_student,p_recipient);
 IF (SELECT count(DISTINCT (x->>'kind',x->>'id')) FROM jsonb_array_elements(p_refs) x)<>jsonb_array_length(p_refs) THEN RETURN false; END IF;
 FOR ref IN SELECT value FROM jsonb_array_elements(p_refs) LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(context->'sources') s WHERE
   jsonb_build_object('kind',s->'kind','id',s->'id','revision',s->'revision','stamp',s->'stamp')=ref) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

-- A skipped topic also invalidates previously generated questions, including
-- questions requested without any saved sources.
CREATE FUNCTION public.student_ai_result_current(p_firm uuid,p_actor uuid,p_student uuid,p_recipient uuid,p_refs jsonb,p_mode text,p_result jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE context jsonb;
BEGIN
 IF NOT public.student_ai_sources_current(p_firm,p_actor,p_student,p_recipient,p_refs) THEN RETURN false; END IF;
 IF p_mode='questions' AND p_result IS NOT NULL THEN
  context:=public.student_ai_context(p_firm,p_actor,p_student,p_recipient);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_result->'items') item WHERE context->'excludedQuestionKeys' ? (item->>'questionKey')) THEN RETURN false; END IF;
 END IF;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

CREATE TABLE student_ai_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),firm_id uuid NOT NULL REFERENCES firms(id),student_id uuid NOT NULL REFERENCES students(id),
 owner_user_id uuid NOT NULL REFERENCES users(id),recipient_user_id uuid NOT NULL REFERENCES users(id),
 mode text NOT NULL CHECK(mode IN ('questions','story','narrative','strategy')),
 source_refs jsonb NOT NULL CHECK(jsonb_typeof(source_refs)='array' AND jsonb_array_length(source_refs)<=20),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','failed','dismissed')),
 result jsonb,used_indices integer[] NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(result IS NULL OR (jsonb_typeof(result)='object' AND jsonb_typeof(result->'items')='array' AND jsonb_array_length(result->'items') BETWEEN 1 AND 4 AND length(result::text)<=20000)),
 CHECK(status<>'ready' OR result IS NOT NULL),
 CHECK(cardinality(used_indices)<=4 AND used_indices <@ ARRAY[0,1,2,3] AND array_position(used_indices,NULL) IS NULL)
);
CREATE INDEX student_ai_requests_owner ON student_ai_requests(firm_id,owner_user_id,student_id,created_at DESC);
CREATE INDEX student_ai_requests_recipient ON student_ai_requests(recipient_user_id);
ALTER TABLE student_ai_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON student_ai_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON student_ai_requests TO authenticated,service_role;
GRANT DELETE ON student_ai_requests TO service_role;
CREATE POLICY student_ai_requests_read ON student_ai_requests FOR SELECT TO authenticated USING (
 owner_user_id=public.current_user_id() AND public.interview_can_access(firm_id,student_id)
 AND public.student_ai_result_current(firm_id,owner_user_id,student_id,recipient_user_id,source_refs,mode,result));
CREATE POLICY student_ai_requests_insert ON student_ai_requests FOR INSERT TO authenticated WITH CHECK(owner_user_id=public.current_user_id() AND public.interview_can_access(firm_id,student_id));
CREATE POLICY student_ai_requests_update ON student_ai_requests FOR UPDATE TO authenticated USING(owner_user_id=public.current_user_id() AND public.interview_can_access(firm_id,student_id)) WITH CHECK(owner_user_id=public.current_user_id() AND public.interview_can_access(firm_id,student_id));

-- Quota metadata carries no interview/source content. It remains countable after
-- source withdrawal hides a request, so withdrawing a source cannot reset limits.
CREATE TABLE student_ai_request_usage (
 request_id uuid PRIMARY KEY REFERENCES student_ai_requests(id) ON DELETE CASCADE,
 firm_id uuid NOT NULL REFERENCES firms(id),owner_user_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX student_ai_request_usage_owner ON student_ai_request_usage(firm_id,owner_user_id,created_at);
ALTER TABLE student_ai_request_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON student_ai_request_usage FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON student_ai_request_usage TO authenticated,service_role;
GRANT DELETE ON student_ai_request_usage TO service_role;
CREATE POLICY student_ai_usage_read ON student_ai_request_usage FOR SELECT TO authenticated USING(firm_id=public.firm_id() AND owner_user_id=public.current_user_id());
CREATE POLICY student_ai_usage_insert ON student_ai_request_usage FOR INSERT TO authenticated WITH CHECK(firm_id=public.firm_id() AND owner_user_id=public.current_user_id());
CREATE FUNCTION public.guard_student_ai_usage() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Usage is recorded with an AI request'; END IF;
 NEW.created_at:=now();RETURN NEW;
END $$;
CREATE TRIGGER guard_student_ai_usage BEFORE INSERT ON student_ai_request_usage FOR EACH ROW EXECUTE FUNCTION public.guard_student_ai_usage();

CREATE FUNCTION public.guard_student_ai_request() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
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
  IF (SELECT count(*) FROM student_ai_request_usage WHERE firm_id=NEW.firm_id AND owner_user_id=NEW.owner_user_id AND created_at>now()-interval '1 hour')>=10
   OR (SELECT count(*) FROM student_ai_request_usage WHERE firm_id=NEW.firm_id AND owner_user_id=NEW.owner_user_id AND created_at>now()-interval '24 hours')>=40
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
CREATE TRIGGER guard_student_ai_request BEFORE INSERT OR UPDATE ON student_ai_requests FOR EACH ROW EXECUTE FUNCTION public.guard_student_ai_request();
CREATE FUNCTION public.record_student_ai_usage() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN INSERT INTO student_ai_request_usage(request_id,firm_id,owner_user_id) VALUES(NEW.id,NEW.firm_id,NEW.owner_user_id);RETURN NULL;END $$;
CREATE TRIGGER record_student_ai_usage AFTER INSERT ON student_ai_requests FOR EACH ROW EXECUTE FUNCTION public.record_student_ai_usage();

-- Acceptance is explicit, idempotent and transactional. Generated work is never
-- confirmed or family-shared by this routine. Normal bank/brief controls apply.
CREATE FUNCTION public.accept_student_ai_suggestion(p_firm uuid,p_actor uuid,p_request uuid,p_index integer,p_title text,p_body text,p_section_revision integer DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE req student_ai_requests; item jsonb; role text; target uuid; answer_id uuid; ids uuid[]; refs jsonb; existing student_strategy_sections;
BEGIN
 SELECT * INTO req FROM student_ai_requests WHERE id=p_request AND firm_id=p_firm AND owner_user_id=p_actor FOR UPDATE;
 IF req.id IS NULL THEN RAISE EXCEPTION 'Suggestion no longer available'; END IF;
 role:=public.work_actor(p_firm,p_actor,req.student_id);
 IF req.status<>'ready' OR req.created_at<now()-interval '30 days' OR NOT public.student_ai_result_current(p_firm,p_actor,req.student_id,req.recipient_user_id,req.source_refs,req.mode,req.result) THEN RAISE EXCEPTION 'AI context changed; refresh before continuing'; END IF;
 IF p_index IS NULL OR p_index<0 OR p_index>=jsonb_array_length(req.result->'items') OR p_index=ANY(req.used_indices) THEN RAISE EXCEPTION 'Suggestion already used or unavailable'; END IF;
 IF length(btrim(p_title)) NOT BETWEEN 1 AND 160 OR length(btrim(p_body)) NOT BETWEEN 1 AND 3000 OR p_title IS NULL OR p_body IS NULL THEN RAISE EXCEPTION 'Review the title and text before saving'; END IF;
 item:=req.result->'items'->p_index;
 IF jsonb_typeof(item->'sourceKeys') IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(item->'sourceKeys') k WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(req.source_refs) s WHERE (s->>'kind')||':'||(s->>'id')=k)) THEN RAISE EXCEPTION 'Suggestion sources are invalid'; END IF;
 SELECT (s->>'id')::uuid INTO answer_id FROM jsonb_array_elements(req.source_refs) s WHERE s->>'kind'='answer' AND item->'sourceKeys' ? ('answer:'||(s->>'id')) LIMIT 1;
 IF req.mode='questions' THEN
  IF role NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Open your interview response to explore this question'; END IF;
  INSERT INTO student_interview_followups(firm_id,student_id,recipient_user_id,created_by_user_id,source_answer_id,question,audience)
  VALUES(p_firm,req.student_id,req.recipient_user_id,p_actor,answer_id,p_body,'counselor') RETURNING id INTO target;
 ELSIF req.mode IN ('story','narrative') THEN
  IF role NOT IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Story editing access required'; END IF;
  SELECT coalesce(array_agg((s->>'id')::uuid),'{}') INTO ids FROM jsonb_array_elements(req.source_refs) s WHERE s->>'kind'='bank' AND item->'sourceKeys' ? ('bank:'||(s->>'id'));
  IF (req.mode='story' AND answer_id IS NULL) OR (req.mode='narrative' AND cardinality(ids)=0) THEN RAISE EXCEPTION 'Choose supporting evidence'; END IF;
  INSERT INTO student_story_bank(firm_id,student_id,kind,title,body,audience,review_state,created_by_user_id,source_answer_id,story_ids)
  VALUES(p_firm,req.student_id,req.mode,p_title,p_body,'counselor','draft',p_actor,CASE WHEN req.mode='story' THEN answer_id END,CASE WHEN req.mode='narrative' THEN ids ELSE '{}' END) RETURNING id INTO target;
 ELSE
  IF role NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') OR coalesce(item->>'sectionKey','') NOT IN ('priorities','constraints','strengths','narratives','alignment','next_steps') THEN RAISE EXCEPTION 'Counselor strategy access required'; END IF;
  -- Retain all selected evidence, not only what the model chose to cite.
  SELECT coalesce(jsonb_agg(s-'stamp'),'[]') INTO refs FROM jsonb_array_elements(req.source_refs) s;
  SELECT * INTO existing FROM student_strategy_sections WHERE firm_id=p_firm AND student_id=req.student_id AND section_key=item->>'sectionKey' FOR UPDATE;
  IF coalesce(existing.revision,0) IS DISTINCT FROM p_section_revision THEN RAISE EXCEPTION 'Strategy brief changed; refresh before saving'; END IF;
  IF existing.id IS NULL THEN
   INSERT INTO student_strategy_sections(firm_id,student_id,section_key,body,evidence,publication_state,created_by_user_id,updated_by_user_id)
   VALUES(p_firm,req.student_id,item->>'sectionKey',p_body,refs,'draft',p_actor,p_actor) RETURNING id INTO target;
  ELSE
   IF NOT public.strategy_sources_ready(p_firm,req.student_id,existing.evidence,'staff',true) THEN RAISE EXCEPTION 'Refresh existing strategy sources first'; END IF;
   SELECT jsonb_agg(x) INTO refs FROM (SELECT DISTINCT value x FROM jsonb_array_elements(existing.evidence||refs)) combined;
   IF jsonb_array_length(refs)>20 THEN RAISE EXCEPTION 'Review the strategy section directly; it has too many sources to append'; END IF;
   UPDATE student_strategy_sections SET body=body||E'\n\n'||p_body,evidence=refs,publication_state='draft',student_review='pending',family_shared=false,revision=revision+1,updated_by_user_id=p_actor WHERE id=existing.id AND firm_id=p_firm RETURNING id INTO target;
  END IF;
 END IF;
 UPDATE student_ai_requests SET used_indices=array_append(used_indices,p_index) WHERE id=req.id AND firm_id=p_firm;
 RETURN target;
END $$;

REVOKE ALL ON FUNCTION public.student_ai_context(uuid,uuid,uuid,uuid),public.student_ai_sources_current(uuid,uuid,uuid,uuid,jsonb),public.student_ai_result_current(uuid,uuid,uuid,uuid,jsonb,text,jsonb),public.guard_student_ai_request(),public.guard_student_ai_usage(),public.record_student_ai_usage(),public.accept_student_ai_suggestion(uuid,uuid,uuid,integer,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.student_ai_context(uuid,uuid,uuid,uuid),public.student_ai_sources_current(uuid,uuid,uuid,uuid,jsonb),public.student_ai_result_current(uuid,uuid,uuid,uuid,jsonb,text,jsonb),public.accept_student_ai_suggestion(uuid,uuid,uuid,integer,text,text,integer) TO authenticated,service_role;
