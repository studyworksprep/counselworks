-- Connected college workspace. All RPCs run with the caller's RLS and also
-- validate the named actor for the local service-client fallback.
ALTER TABLE essay_drafts ADD COLUMN character_count_limit integer CHECK (character_count_limit > 0);
ALTER TABLE essay_drafts ADD COLUMN library_prompt_snapshot jsonb;

-- One application per list entry is the existing product model. Do not silently
-- discard historical duplicates: an operator must reconcile any before release.
CREATE UNIQUE INDEX applications_one_per_college ON applications(firm_id, student_college_id);

CREATE FUNCTION public.assign_college_prompts(p_firm uuid, p_actor uuid, p_college uuid, p_prompt uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE sc student_colleges; entry integer; r text; p record; draft_id uuid; app_id uuid; assigned integer := 0;
BEGIN
  SELECT * INTO sc FROM student_colleges WHERE id=p_college AND firm_id=p_firm FOR UPDATE;
  IF sc.id IS NULL THEN RAISE EXCEPTION 'College not found'; END IF;
  r := public.work_actor(p_firm,p_actor,sc.student_id);
  IF r NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Staff access required'; END IF;
  SELECT graduation_year INTO entry FROM students WHERE id=sc.student_id AND firm_id=p_firm;
  SELECT id INTO app_id FROM applications WHERE firm_id=p_firm AND student_college_id=sc.id;
  IF p_prompt IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM colleges c JOIN college_prompt_sets ps ON ps.scorecard_id=c.scorecard_id
    JOIN college_library_prompts lp ON lp.prompt_set_id=ps.id
    WHERE c.id=sc.college_id AND ps.entry_year=entry AND ps.coverage='verified' AND lp.id=p_prompt
  ) THEN RAISE EXCEPTION 'No verified prompt for this college and entry year'; END IF;
  FOR p IN
    SELECT lp.*,ps.entry_year,ps.source_url,ps.verified_on
    FROM colleges c JOIN college_prompt_sets ps ON ps.scorecard_id=c.scorecard_id
    JOIN college_library_prompts lp ON lp.prompt_set_id=ps.id
    WHERE c.id=sc.college_id AND ps.entry_year=entry AND ps.coverage='verified'
      AND ((p_prompt IS NULL AND lp.requirement='required') OR lp.id=p_prompt)
    ORDER BY lp.sort_order,lp.id
  LOOP
    draft_id := NULL;
    INSERT INTO essay_drafts(firm_id,student_id,student_college_id,application_id,library_prompt_id,
      essay_type,title,prompt_text,body,word_count_target,word_count_limit,character_count_limit,
      library_prompt_snapshot,status,visibility_scope,current_version_number,created_by_user_id,updated_by_user_id)
    VALUES(p_firm,sc.student_id,sc.id,app_id,p.id,'supplemental',p.title,
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
    ON CONFLICT(firm_id,student_id,library_prompt_id) WHERE library_prompt_id IS NOT NULL DO NOTHING RETURNING id INTO draft_id;
    IF draft_id IS NOT NULL THEN
      INSERT INTO essay_draft_versions(essay_draft_id,version_number,body,created_by_user_id) VALUES(draft_id,1,'',p_actor);
      assigned := assigned + 1;
    ELSE
      -- Reconcile links only. Never overwrite a draft, its audience, source
      -- snapshot, review state, or versions when assignments are refreshed.
      UPDATE essay_drafts SET student_college_id=sc.id,application_id=coalesce(application_id,app_id)
      WHERE firm_id=p_firm AND student_id=sc.student_id AND library_prompt_id=p.id;
    END IF;
  END LOOP;
  RETURN assigned;
END $$;
REVOKE ALL ON FUNCTION public.assign_college_prompts(uuid,uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_college_prompts(uuid,uuid,uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.assign_college_library_prompts() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  PERFORM public.assign_college_prompts(NEW.firm_id,NEW.created_by_user_id,NEW.id);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.link_library_essays_to_application() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  -- Also covers a pre-existing list whose prompt library became available later.
  PERFORM public.assign_college_prompts(NEW.firm_id,NEW.created_by_user_id,NEW.student_college_id);
  UPDATE essay_drafts SET application_id=NEW.id
    WHERE firm_id=NEW.firm_id AND student_id=NEW.student_id
      AND student_college_id=NEW.student_college_id AND application_id IS NULL;
  RETURN NEW;
END $$;

CREATE FUNCTION public.create_college_application(p_firm uuid,p_actor uuid,p_college uuid,p_round text,p_deadline timestamptz,p_source text,p_checklist jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE sc student_colleges; r text; app_id uuid;
BEGIN
  SELECT * INTO sc FROM student_colleges WHERE id=p_college AND firm_id=p_firm FOR UPDATE;
  IF sc.id IS NULL THEN RAISE EXCEPTION 'College not found'; END IF;
  r := public.work_actor(p_firm,p_actor,sc.student_id);
  IF r NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Staff access required'; END IF;
  IF p_round NOT IN ('ea','ed','ed2','rea','rd','rolling') OR p_source NOT IN ('explicit','estimate') THEN RAISE EXCEPTION 'Invalid application details'; END IF;
  SELECT id INTO app_id FROM applications WHERE firm_id=p_firm AND student_college_id=sc.id;
  IF app_id IS NOT NULL THEN RETURN jsonb_build_object('id',app_id,'created',false); END IF;
  INSERT INTO applications(firm_id,student_id,college_id,student_college_id,application_type,stage,
    deadline_at,deadline_source,checklist_json,created_by_user_id,updated_by_user_id)
    VALUES(p_firm,sc.student_id,sc.college_id,sc.id,p_round,'not_started',p_deadline,p_source,p_checklist,p_actor,p_actor)
    RETURNING id INTO app_id;
  UPDATE student_colleges SET status='applying',round_type=p_round,updated_by_user_id=p_actor,updated_at=now()
    WHERE firm_id=p_firm AND id=sc.id;
  RETURN jsonb_build_object('id',app_id,'created',true);
END $$;
REVOKE ALL ON FUNCTION public.create_college_application(uuid,uuid,uuid,text,timestamptz,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_college_application(uuid,uuid,uuid,text,timestamptz,text,jsonb) TO authenticated,service_role;

-- The global New Application form creates its list entry and initial writing
-- inside the same transaction as the application. Lock the student so parallel
-- requests cannot create competing list entries.
CREATE FUNCTION public.create_student_application(p_firm uuid,p_actor uuid,p_student uuid,p_catalog uuid,p_round text,p_deadline timestamptz,p_source text,p_checklist jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r text; sc_id uuid;
BEGIN
  r := public.work_actor(p_firm,p_actor,p_student);
  IF r NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Staff access required'; END IF;
  PERFORM 1 FROM students WHERE id=p_student AND firm_id=p_firm FOR UPDATE;
  SELECT id INTO sc_id FROM student_colleges WHERE firm_id=p_firm AND student_id=p_student AND college_id=p_catalog;
  IF sc_id IS NULL THEN
    INSERT INTO student_colleges(firm_id,student_id,college_id,category,round_type,status,created_by_user_id,updated_by_user_id)
    VALUES(p_firm,p_student,p_catalog,'target',p_round,'applying',p_actor,p_actor) RETURNING id INTO sc_id;
  END IF;
  RETURN public.create_college_application(p_firm,p_actor,sc_id,p_round,p_deadline,p_source,p_checklist);
END $$;
REVOKE ALL ON FUNCTION public.create_student_application(uuid,uuid,uuid,uuid,text,timestamptz,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_student_application(uuid,uuid,uuid,uuid,text,timestamptz,text,jsonb) TO authenticated,service_role;
