-- The shared baseline stays read-only. Firms publish their own reviewed revisions.
-- Historical revisions and assigned essay source snapshots are never rewritten.
ALTER TABLE college_prompt_sets
  ADD COLUMN firm_id uuid REFERENCES firms(id),
  ADD COLUMN review_state text NOT NULL DEFAULT 'published' CHECK (review_state IN ('draft','published','archived')),
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  ADD COLUMN review_due_on date,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN published_at timestamptz,
  ADD COLUMN updated_by_user_id uuid REFERENCES users(id),
  ADD COLUMN published_by_user_id uuid REFERENCES users(id);
ALTER TABLE college_prompt_sets DROP CONSTRAINT college_prompt_sets_scorecard_id_entry_year_key;
CREATE UNIQUE INDEX college_prompt_shared_year ON college_prompt_sets(scorecard_id,entry_year) WHERE firm_id IS NULL;
CREATE UNIQUE INDEX college_prompt_firm_revision ON college_prompt_sets(firm_id,scorecard_id,entry_year,revision) WHERE firm_id IS NOT NULL;
CREATE UNIQUE INDEX college_prompt_firm_live ON college_prompt_sets(firm_id,scorecard_id,entry_year) WHERE firm_id IS NOT NULL AND review_state='published';
CREATE UNIQUE INDEX college_prompt_firm_draft ON college_prompt_sets(firm_id,scorecard_id,entry_year) WHERE firm_id IS NOT NULL AND review_state='draft';
ALTER TABLE college_library_prompts ADD COLUMN firm_id uuid REFERENCES firms(id);
CREATE INDEX college_library_prompts_firm ON college_library_prompts(firm_id);
CREATE INDEX college_prompt_sets_firm ON college_prompt_sets(firm_id);

-- Review evidence is separately protected, including direct database API access.
ALTER TABLE college_prompt_sets ADD CONSTRAINT college_prompt_set_firm_identity UNIQUE(id,firm_id);
CREATE TABLE college_prompt_review_evidence (
  prompt_set_id uuid PRIMARY KEY,
  firm_id uuid NOT NULL REFERENCES firms(id),
  review_notes text NOT NULL DEFAULT '',
  FOREIGN KEY(prompt_set_id,firm_id) REFERENCES college_prompt_sets(id,firm_id)
);
CREATE INDEX college_prompt_review_evidence_firm ON college_prompt_review_evidence(firm_id);
ALTER TABLE college_prompt_review_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON college_prompt_review_evidence FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON college_prompt_review_evidence TO authenticated;
GRANT ALL ON college_prompt_review_evidence TO service_role;
CREATE POLICY prompt_evidence_read ON college_prompt_review_evidence FOR SELECT TO authenticated USING (firm_id=public.firm_id() AND public.is_staff());
CREATE POLICY prompt_evidence_write ON college_prompt_review_evidence FOR ALL TO authenticated USING (
  firm_id=public.firm_id() AND public.current_member_role() IN ('firm_owner','firm_admin','counselor','essay_coach','tutor')
  AND EXISTS (SELECT 1 FROM college_prompt_sets s WHERE s.id=prompt_set_id AND s.firm_id=college_prompt_review_evidence.firm_id AND s.review_state='draft')) WITH CHECK (
  firm_id=public.firm_id() AND public.current_member_role() IN ('firm_owner','firm_admin','counselor','essay_coach','tutor')
  AND EXISTS (SELECT 1 FROM college_prompt_sets s WHERE s.id=prompt_set_id AND s.firm_id=college_prompt_review_evidence.firm_id AND s.review_state='draft'));

-- A logical response remains the same assignment across catalog revisions.
ALTER TABLE essay_drafts ADD COLUMN library_prompt_slot text;
UPDATE essay_drafts e SET library_prompt_slot=s.scorecard_id::text || ':' || s.entry_year::text || ':' || p.prompt_key
FROM college_library_prompts p JOIN college_prompt_sets s ON s.id=p.prompt_set_id WHERE e.library_prompt_id=p.id;
CREATE UNIQUE INDEX essay_drafts_library_slot_once ON essay_drafts(firm_id,student_id,library_prompt_slot) WHERE library_prompt_slot IS NOT NULL;

DROP POLICY college_prompt_sets_read ON college_prompt_sets;
CREATE POLICY college_prompt_sets_read ON college_prompt_sets FOR SELECT TO authenticated USING (
  firm_id IS NULL OR (firm_id=public.firm_id() AND (review_state='published' OR public.is_staff())));
CREATE POLICY college_prompt_sets_insert ON college_prompt_sets FOR INSERT TO authenticated WITH CHECK (
  firm_id=public.firm_id() AND review_state='draft' AND public.current_member_role() IN ('firm_owner','firm_admin','counselor','essay_coach','tutor'));
CREATE POLICY college_prompt_sets_update ON college_prompt_sets FOR UPDATE TO authenticated USING (
  firm_id=public.firm_id() AND public.current_member_role() IN ('firm_owner','firm_admin','counselor','essay_coach','tutor')) WITH CHECK (firm_id=public.firm_id());
DROP POLICY college_library_prompts_read ON college_library_prompts;
CREATE POLICY college_library_prompts_read ON college_library_prompts FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM college_prompt_sets s WHERE s.id=prompt_set_id));
CREATE POLICY college_library_prompts_write ON college_library_prompts FOR ALL TO authenticated USING (
  firm_id=public.firm_id() AND public.current_member_role() IN ('firm_owner','firm_admin','counselor','essay_coach','tutor')
  AND EXISTS (SELECT 1 FROM college_prompt_sets s WHERE s.id=prompt_set_id AND s.firm_id=college_library_prompts.firm_id AND s.review_state='draft')) WITH CHECK (
  firm_id=public.firm_id() AND public.current_member_role() IN ('firm_owner','firm_admin','counselor','essay_coach','tutor')
  AND EXISTS (SELECT 1 FROM college_prompt_sets s WHERE s.id=prompt_set_id AND s.firm_id=college_library_prompts.firm_id AND s.review_state='draft'));
GRANT INSERT,UPDATE ON college_prompt_sets TO authenticated;
GRANT INSERT,UPDATE,DELETE ON college_library_prompts TO authenticated;

-- Enforcement also covers direct REST writes, not only the application's actions.
CREATE FUNCTION public.guard_prompt_review() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r text;
BEGIN
  IF NEW.firm_id IS NULL THEN
    IF current_user NOT IN ('postgres','service_role') THEN RAISE EXCEPTION 'Shared catalog is read only'; END IF;
    RETURN NEW;
  END IF;
  r := public.work_actor(NEW.firm_id,NEW.updated_by_user_id,NULL);
  IF r NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Staff access required'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (NEW.id,NEW.firm_id,NEW.scorecard_id,NEW.college_name,NEW.entry_year,NEW.revision) IS DISTINCT FROM
       (OLD.id,OLD.firm_id,OLD.scorecard_id,OLD.college_name,OLD.entry_year,OLD.revision) THEN RAISE EXCEPTION 'Review identity is immutable'; END IF;
    IF OLD.review_state<>'draft' THEN
      IF OLD.review_state<>'published' OR NEW.review_state<>'archived' OR r NOT IN ('firm_owner','firm_admin') OR
        (to_jsonb(NEW)-ARRAY['review_state','updated_at','updated_by_user_id']) IS DISTINCT FROM
        (to_jsonb(OLD)-ARRAY['review_state','updated_at','updated_by_user_id']) THEN RAISE EXCEPTION 'Published requirements are immutable; create a revision'; END IF;
    END IF;
  ELSIF NEW.review_state<>'draft' THEN RAISE EXCEPTION 'Create a draft before publishing';
  END IF;
  IF NEW.review_state='published' THEN
    IF r NOT IN ('firm_owner','firm_admin') THEN RAISE EXCEPTION 'Only owners and admins can publish'; END IF;
    IF NEW.verified_on IS NULL OR NEW.verified_on>CURRENT_DATE OR NEW.verified_on<CURRENT_DATE-365
      OR NEW.review_due_on IS NULL OR NEW.review_due_on<=CURRENT_DATE OR NOT EXISTS (SELECT 1 FROM college_prompt_review_evidence e WHERE e.prompt_set_id=NEW.id AND e.firm_id=NEW.firm_id AND btrim(e.review_notes)<>'') THEN
      RAISE EXCEPTION 'Record a current source check, future review date, and review evidence before publishing'; END IF;
    IF NEW.coverage='verified' AND NOT EXISTS (SELECT 1 FROM college_library_prompts WHERE prompt_set_id=NEW.id) THEN RAISE EXCEPTION 'Verified coverage requires prompts'; END IF;
    IF NEW.coverage='no_supplement' AND EXISTS (SELECT 1 FROM college_library_prompts WHERE prompt_set_id=NEW.id AND requirement='required') THEN RAISE EXCEPTION 'No general supplement cannot have universally required prompts'; END IF;
    NEW.published_at:=now(); NEW.published_by_user_id:=NEW.updated_by_user_id;
  ELSIF NEW.review_state='draft' THEN
    NEW.published_at:=NULL; NEW.published_by_user_id:=NULL;
  END IF;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER guard_prompt_review BEFORE INSERT OR UPDATE ON college_prompt_sets FOR EACH ROW EXECUTE FUNCTION public.guard_prompt_review();
CREATE FUNCTION public.guard_prompt_review_response() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s college_prompt_sets; parent_id uuid;
BEGIN
  parent_id:=CASE WHEN TG_OP='DELETE' THEN OLD.prompt_set_id ELSE NEW.prompt_set_id END;
  SELECT * INTO s FROM college_prompt_sets WHERE id=parent_id FOR UPDATE;
  IF current_user NOT IN ('postgres','service_role') AND (s.firm_id IS NULL OR s.review_state<>'draft') THEN RAISE EXCEPTION 'Only draft responses can be edited'; END IF;
  IF TG_OP<>'DELETE' AND NEW.firm_id IS DISTINCT FROM s.firm_id THEN RAISE EXCEPTION 'Response must belong to its review firm'; END IF;
  IF TG_OP='UPDATE' AND (OLD.prompt_set_id,OLD.firm_id) IS DISTINCT FROM (NEW.prompt_set_id,NEW.firm_id) THEN RAISE EXCEPTION 'Response identity is immutable'; END IF;
  -- Response edits take the same parent lock as saves/publishing and invalidate
  -- stale editor versions, including direct REST edits.
  IF s.firm_id IS NOT NULL AND s.review_state='draft' THEN
    UPDATE college_prompt_sets SET updated_by_user_id=CASE WHEN current_user IN ('postgres','service_role') THEN s.updated_by_user_id ELSE public.current_user_id() END
      WHERE id=s.id AND firm_id=s.firm_id;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_prompt_evidence BEFORE INSERT OR UPDATE ON college_prompt_review_evidence FOR EACH ROW EXECUTE FUNCTION public.guard_prompt_review_response();
CREATE TRIGGER guard_prompt_review_response BEFORE INSERT OR UPDATE OR DELETE ON college_library_prompts FOR EACH ROW EXECUTE FUNCTION public.guard_prompt_review_response();

CREATE FUNCTION public.start_prompt_review(p_firm uuid,p_actor uuid,p_source uuid,p_year integer)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s college_prompt_sets; draft_id uuid; rev integer; r text;
BEGIN
  r:=public.work_actor(p_firm,p_actor,NULL);
  IF r NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Staff access required'; END IF;
  SELECT * INTO s FROM college_prompt_sets WHERE id=p_source AND (firm_id IS NULL OR firm_id=p_firm);
  IF s.id IS NULL THEN RAISE EXCEPTION 'Source not found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_firm::text || ':' || s.scorecard_id::text || ':' || p_year::text,0));
  SELECT id INTO draft_id FROM college_prompt_sets WHERE firm_id=p_firm AND scorecard_id=s.scorecard_id AND entry_year=p_year AND review_state='draft';
  IF draft_id IS NOT NULL THEN RETURN draft_id; END IF;
  SELECT coalesce(max(revision),0)+1 INTO rev FROM college_prompt_sets WHERE firm_id=p_firm AND scorecard_id=s.scorecard_id AND entry_year=p_year;
  INSERT INTO college_prompt_sets(firm_id,scorecard_id,college_name,entry_year,coverage,source_url,notes,review_state,revision,updated_by_user_id)
  VALUES(p_firm,s.scorecard_id,s.college_name,p_year,'needs_review',s.source_url,s.notes,'draft',rev,p_actor) RETURNING id INTO draft_id;
  INSERT INTO college_prompt_review_evidence(prompt_set_id,firm_id) VALUES(draft_id,p_firm);
  INSERT INTO college_library_prompts(firm_id,prompt_set_id,prompt_key,title,prompt_text,word_limit,character_limit,requirement,text_kind,sort_order)
  SELECT p_firm,draft_id,prompt_key,title,prompt_text,word_limit,character_limit,requirement,text_kind,sort_order FROM college_library_prompts WHERE prompt_set_id=s.id;
  RETURN draft_id;
END $$;

CREATE FUNCTION public.save_prompt_review(p_firm uuid,p_actor uuid,p_review uuid,p_expected timestamptz,p_content jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s college_prompt_sets; r text;
BEGIN
  r:=public.work_actor(p_firm,p_actor,NULL);
  IF r NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Staff access required'; END IF;
  SELECT * INTO s FROM college_prompt_sets WHERE firm_id=p_firm AND id=p_review FOR UPDATE;
  IF s.id IS NULL OR s.review_state<>'draft' THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF s.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'This review changed; reload before saving'; END IF;
  UPDATE college_prompt_sets SET coverage=p_content->>'coverage',source_url=p_content->>'source_url',
    verified_on=nullif(p_content->>'verified_on','')::date,review_due_on=nullif(p_content->>'review_due_on','')::date,
    notes=p_content->>'notes',updated_by_user_id=p_actor WHERE id=s.id AND firm_id=p_firm;
  INSERT INTO college_prompt_review_evidence(prompt_set_id,firm_id,review_notes) VALUES(s.id,p_firm,p_content->>'review_notes')
    ON CONFLICT(prompt_set_id) DO UPDATE SET review_notes=EXCLUDED.review_notes WHERE college_prompt_review_evidence.firm_id=p_firm;
  DELETE FROM college_library_prompts WHERE prompt_set_id=s.id AND firm_id=p_firm;
  INSERT INTO college_library_prompts(firm_id,prompt_set_id,prompt_key,title,prompt_text,word_limit,character_limit,requirement,text_kind,sort_order)
  SELECT p_firm,s.id,p->>'prompt_key',p->>'title',p->>'prompt_text',nullif(p->>'word_limit','')::int,nullif(p->>'character_limit','')::int,
    p->>'requirement',p->>'text_kind',(ordinality-1)::int FROM jsonb_array_elements(p_content->'prompts') WITH ORDINALITY AS items(p,ordinality);
END $$;

CREATE FUNCTION public.publish_prompt_review(p_firm uuid,p_actor uuid,p_review uuid,p_expected timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE s college_prompt_sets;
BEGIN
  IF public.work_actor(p_firm,p_actor,NULL) NOT IN ('firm_owner','firm_admin') THEN RAISE EXCEPTION 'Only owners and admins can publish'; END IF;
  SELECT * INTO s FROM college_prompt_sets WHERE id=p_review AND firm_id=p_firm;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Draft not found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_firm::text || ':' || s.scorecard_id::text || ':' || s.entry_year::text,0));
  SELECT * INTO s FROM college_prompt_sets WHERE id=p_review AND firm_id=p_firm FOR UPDATE;
  IF s.review_state<>'draft' OR s.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'This review changed; reload before publishing'; END IF;
  UPDATE college_prompt_sets SET review_state='archived',updated_by_user_id=p_actor WHERE firm_id=p_firm AND scorecard_id=s.scorecard_id AND entry_year=s.entry_year AND review_state='published';
  UPDATE college_prompt_sets SET review_state='published',updated_by_user_id=p_actor WHERE id=s.id AND firm_id=p_firm;
END $$;

REVOKE ALL ON FUNCTION public.guard_prompt_review(),public.guard_prompt_review_response(),public.start_prompt_review(uuid,uuid,uuid,integer),
 public.save_prompt_review(uuid,uuid,uuid,timestamptz,jsonb),public.publish_prompt_review(uuid,uuid,uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_prompt_review(uuid,uuid,uuid,integer),public.save_prompt_review(uuid,uuid,uuid,timestamptz,jsonb),
 public.publish_prompt_review(uuid,uuid,uuid,timestamptz) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.assign_college_prompts(p_firm uuid, p_actor uuid, p_college uuid, p_prompt uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE sc student_colleges; entry integer; r text; p record; draft_id uuid; app_id uuid; assigned integer := 0; active_set uuid; slot text;
BEGIN
  SELECT * INTO sc FROM student_colleges WHERE id=p_college AND firm_id=p_firm FOR UPDATE;
  IF sc.id IS NULL THEN RAISE EXCEPTION 'College not found'; END IF;
  r := public.work_actor(p_firm,p_actor,sc.student_id);
  IF r NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Staff access required'; END IF;
  SELECT graduation_year INTO entry FROM students WHERE id=sc.student_id AND firm_id=p_firm;
  SELECT id INTO app_id FROM applications WHERE firm_id=p_firm AND student_college_id=sc.id;
  SELECT ps.id INTO active_set FROM colleges c JOIN college_prompt_sets ps ON ps.scorecard_id=c.scorecard_id
    WHERE c.id=sc.college_id AND ps.entry_year=entry AND ps.review_state='published'
      AND (ps.firm_id IS NULL OR ps.firm_id=p_firm) ORDER BY ps.firm_id NULLS LAST LIMIT 1;
  IF p_prompt IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM colleges c JOIN college_prompt_sets ps ON ps.scorecard_id=c.scorecard_id
    JOIN college_library_prompts lp ON lp.prompt_set_id=ps.id
    WHERE c.id=sc.college_id AND ps.id=active_set AND ps.coverage IN ('verified','no_supplement') AND lp.id=p_prompt
  ) THEN RAISE EXCEPTION 'No verified prompt for this college and entry year'; END IF;
  FOR p IN
    SELECT lp.*,ps.entry_year,ps.scorecard_id,ps.source_url,ps.verified_on
    FROM colleges c JOIN college_prompt_sets ps ON ps.scorecard_id=c.scorecard_id
    JOIN college_library_prompts lp ON lp.prompt_set_id=ps.id
    WHERE c.id=sc.college_id AND ps.id=active_set AND ps.coverage IN ('verified','no_supplement')
      AND ((p_prompt IS NULL AND ps.coverage='verified' AND lp.requirement='required') OR lp.id=p_prompt)
    ORDER BY lp.sort_order,lp.id
  LOOP
    draft_id := NULL;
    slot := p.scorecard_id::text || ':' || p.entry_year::text || ':' || p.prompt_key;
    INSERT INTO essay_drafts(firm_id,student_id,student_college_id,application_id,library_prompt_id,library_prompt_slot,
      essay_type,title,prompt_text,body,word_count_target,word_count_limit,character_count_limit,
      library_prompt_snapshot,status,visibility_scope,current_version_number,created_by_user_id,updated_by_user_id)
    VALUES(p_firm,sc.student_id,sc.id,app_id,p.id,slot,'supplemental',p.title,
      CASE WHEN p.text_kind='summary' THEN 'Prompt summary — check the official wording before writing.' || E'\n\n' ELSE '' END
      || p.prompt_text || E'\n\nEntry year: ' || p.entry_year
      || CASE WHEN p.character_limit IS NOT NULL THEN E'\nCharacter limit: ' || p.character_limit ELSE '' END
      || E'\nOfficial source: ' || p.source_url,'',p.word_limit,p.word_limit,p.character_limit,
      jsonb_build_object('entry_year',p.entry_year,'source_url',p.source_url,'verified_on',p.verified_on,
        'requirement',p.requirement,'text_kind',p.text_kind,'word_limit',p.word_limit,'character_limit',p.character_limit),
      'draft',
      -- Deliberate audience: student writing is private from parents until staff
      -- explicitly change the essay's audience in the existing sharing control.
      'student',1,p_actor,p_actor)
    ON CONFLICT DO NOTHING RETURNING id INTO draft_id;
    IF draft_id IS NOT NULL THEN
      INSERT INTO essay_draft_versions(essay_draft_id,version_number,body,created_by_user_id) VALUES(draft_id,1,'',p_actor);
      assigned := assigned + 1;
    ELSE
      -- Reconcile links only. Never overwrite a draft, its audience, source
      -- snapshot, review state, or versions when assignments are refreshed.
      UPDATE essay_drafts SET student_college_id=sc.id,application_id=coalesce(application_id,app_id)
      WHERE firm_id=p_firm AND student_id=sc.student_id AND (library_prompt_id=p.id OR library_prompt_slot=slot);
    END IF;
  END LOOP;
  RETURN assigned;
END $$;
