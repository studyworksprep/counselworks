-- Preserve existing results. A context gap contains no story/theme/strategy
-- proposal; only a reviewed counselor follow-up may be created from it.
BEGIN;

ALTER TABLE public.student_ai_requests DROP CONSTRAINT student_ai_requests_result_check;
ALTER TABLE public.student_ai_requests ADD CONSTRAINT student_ai_requests_result_check CHECK ((
 result IS NULL OR (
  jsonb_typeof(result)='object' AND length(result::text)<=20000
  AND jsonb_typeof(result->'items')='array'
  AND CASE
   WHEN NOT (result ? 'outcome') THEN jsonb_array_length(result->'items') BETWEEN 1 AND 4 AND NOT (result ? 'contextGap')
   WHEN result->>'outcome'='suggestions' THEN jsonb_array_length(result->'items') BETWEEN 1 AND 4 AND result->'contextGap'='null'::jsonb
   WHEN result->>'outcome'='needs_more_context' THEN
    jsonb_array_length(result->'items')=0 AND jsonb_typeof(result->'contextGap')='object'
    AND jsonb_typeof(result->'contextGap'->'reason')='string'
    AND length(btrim(result->'contextGap'->>'reason')) BETWEEN 1 AND 600
    AND jsonb_typeof(result->'contextGap'->'followUpQuestion')='string'
    AND length(btrim(result->'contextGap'->>'followUpQuestion')) BETWEEN 1 AND 600
    AND jsonb_typeof(result->'contextGap'->'sourceKeys')='array'
    AND jsonb_array_length(result->'contextGap'->'sourceKeys') BETWEEN 1 AND 20
   ELSE false
  END
 )
) IS TRUE);
ALTER TABLE public.student_ai_requests ADD CONSTRAINT student_ai_context_gap_usage_check
 CHECK (result->>'outcome' IS DISTINCT FROM 'needs_more_context' OR used_indices <@ ARRAY[0]);

CREATE OR REPLACE FUNCTION public.student_ai_result_current(p_firm uuid,p_actor uuid,p_student uuid,p_recipient uuid,p_refs jsonb,p_mode text,p_result jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE context jsonb; cited jsonb;
BEGIN
 IF NOT public.student_ai_sources_current(p_firm,p_actor,p_student,p_recipient,p_refs) THEN RETURN false; END IF;
 IF p_result->>'outcome'='needs_more_context' THEN
  -- Parent/question assistance remains the existing bounded question workflow.
  IF p_mode='questions' THEN RETURN false; END IF;
  cited:=p_result->'contextGap'->'sourceKeys';
  IF jsonb_typeof(cited) IS DISTINCT FROM 'array' OR jsonb_array_length(cited) NOT BETWEEN 1 AND 20 THEN RETURN false; END IF;
  IF (SELECT count(DISTINCT value)<>count(*) FROM jsonb_array_elements(cited))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(cited) k WHERE jsonb_typeof(k)<>'string'
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_refs) s WHERE to_jsonb((s->>'kind')||':'||(s->>'id'))=k)) THEN RETURN false; END IF;
 END IF;
 IF p_mode='questions' AND p_result IS NOT NULL THEN
  context:=public.student_ai_context(p_firm,p_actor,p_student,p_recipient);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_result->'items') item WHERE context->'excludedQuestionKeys' ? (item->>'questionKey')) THEN RETURN false; END IF;
 END IF;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.accept_student_ai_suggestion(p_firm uuid,p_actor uuid,p_request uuid,p_index integer,p_title text,p_body text,p_section_revision integer DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE req student_ai_requests; item jsonb; role text; target uuid; answer_id uuid; ids uuid[]; refs jsonb; existing student_strategy_sections;
BEGIN
 SELECT * INTO req FROM student_ai_requests WHERE id=p_request AND firm_id=p_firm AND owner_user_id=p_actor FOR UPDATE;
 IF req.id IS NULL THEN RAISE EXCEPTION 'Suggestion no longer available'; END IF;
 role:=public.work_actor(p_firm,p_actor,req.student_id);
 IF req.status<>'ready' OR req.created_at<now()-interval '30 days' OR NOT public.student_ai_result_current(p_firm,p_actor,req.student_id,req.recipient_user_id,req.source_refs,req.mode,req.result) THEN RAISE EXCEPTION 'AI context changed; refresh before continuing'; END IF;
 -- This destination is fixed by the stored outcome, never by a form field.
 IF req.result->>'outcome'='needs_more_context' THEN
  IF p_index IS NULL OR p_index<>0 OR p_index=ANY(req.used_indices) THEN RAISE EXCEPTION 'Suggestion already used or unavailable'; END IF;
  IF role NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Open your cited material to explore this question'; END IF;
  IF p_body IS NULL OR length(btrim(p_body)) NOT BETWEEN 1 AND 3000 THEN RAISE EXCEPTION 'Review the question before saving'; END IF;
  item:=req.result->'contextGap';
  SELECT (s->>'id')::uuid INTO answer_id FROM jsonb_array_elements(req.source_refs) s
   WHERE s->>'kind'='answer' AND item->'sourceKeys' ? ('answer:'||(s->>'id')) LIMIT 1;
  -- Same deliberate initial audience as ordinary reviewed AI follow-ups:
  -- the respondent and counseling team. Only the respondent may widen it.
  INSERT INTO student_interview_followups(firm_id,student_id,recipient_user_id,created_by_user_id,source_answer_id,question,audience)
  VALUES(p_firm,req.student_id,req.recipient_user_id,p_actor,answer_id,p_body,'counselor') RETURNING id INTO target;
  UPDATE student_ai_requests SET used_indices=array_append(used_indices,0) WHERE id=req.id AND firm_id=p_firm;
  RETURN target;
 END IF;
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

REVOKE ALL ON FUNCTION public.student_ai_result_current(uuid,uuid,uuid,uuid,jsonb,text,jsonb),public.accept_student_ai_suggestion(uuid,uuid,uuid,integer,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.student_ai_result_current(uuid,uuid,uuid,uuid,jsonb,text,jsonb),public.accept_student_ai_suggestion(uuid,uuid,uuid,integer,text,text,integer) TO authenticated,service_role;

COMMIT;
