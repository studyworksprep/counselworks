-- Shared, versioned catalog. Publications are maintained through reviewed data
-- migrations/imports, never through a tenant's browser credentials.
CREATE TABLE college_prompt_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scorecard_id integer NOT NULL,
  college_name text NOT NULL,
  entry_year integer NOT NULL CHECK (entry_year BETWEEN 2020 AND 2200),
  coverage text NOT NULL CHECK (coverage IN ('verified','no_supplement','needs_review')),
  source_url text NOT NULL CHECK (source_url LIKE 'https://%'),
  verified_on date,
  notes text NOT NULL DEFAULT '',
  UNIQUE (scorecard_id, entry_year),
  CHECK (coverage = 'needs_review' OR verified_on IS NOT NULL)
);
CREATE TABLE college_library_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_set_id uuid NOT NULL REFERENCES college_prompt_sets(id) ON DELETE RESTRICT,
  prompt_key text NOT NULL,
  title text NOT NULL,
  prompt_text text NOT NULL,
  word_limit integer CHECK (word_limit > 0),
  character_limit integer CHECK (character_limit > 0),
  requirement text NOT NULL CHECK (requirement IN ('required','optional','conditional')),
  text_kind text NOT NULL DEFAULT 'summary' CHECK (text_kind IN ('summary','verbatim')),
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (prompt_set_id, prompt_key)
);
ALTER TABLE college_prompt_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE college_library_prompts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON college_prompt_sets, college_library_prompts FROM anon, authenticated;
GRANT SELECT ON college_prompt_sets, college_library_prompts TO authenticated;
GRANT ALL ON college_prompt_sets, college_library_prompts TO service_role;
CREATE POLICY college_prompt_sets_read ON college_prompt_sets FOR SELECT TO authenticated USING (true);
CREATE POLICY college_library_prompts_read ON college_library_prompts FOR SELECT TO authenticated USING (true);

-- Keep the source identity even if a college is removed from the student's list.
ALTER TABLE essay_drafts ADD COLUMN library_prompt_id uuid REFERENCES college_library_prompts(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX essay_drafts_library_once ON essay_drafts(firm_id, student_id, library_prompt_id)
  WHERE library_prompt_id IS NOT NULL;

-- Both college insertion paths use this trigger. Inserts, versions and list
-- additions succeed or roll back together. Invoker retains caller's RLS.
CREATE FUNCTION public.assign_college_library_prompts() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r text; p record; draft_id uuid; entry integer;
BEGIN
  r := public.work_actor(NEW.firm_id, NEW.created_by_user_id, NEW.student_id);
  IF r NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;
  SELECT graduation_year INTO entry FROM students WHERE id=NEW.student_id AND firm_id=NEW.firm_id;
  FOR p IN
    SELECT lp.*, ps.source_url, ps.entry_year
    FROM colleges c JOIN college_prompt_sets ps ON ps.scorecard_id=c.scorecard_id
      JOIN college_library_prompts lp ON lp.prompt_set_id=ps.id
    WHERE c.id=NEW.college_id AND ps.entry_year=entry AND ps.coverage='verified'
      AND lp.requirement='required'
    ORDER BY lp.sort_order, lp.id
  LOOP
    draft_id := NULL;
    INSERT INTO essay_drafts (firm_id, student_id, student_college_id, library_prompt_id,
      essay_type, title, prompt_text, body, word_count_target, status,
      visibility_scope, current_version_number, created_by_user_id, updated_by_user_id)
    VALUES (NEW.firm_id, NEW.student_id, NEW.id, p.id, 'supplemental', p.title,
      CASE WHEN p.text_kind='summary' THEN 'Prompt summary — check the official wording before writing.' || E'\n\n' ELSE '' END
      || p.prompt_text || E'\n\nEntry year: ' || p.entry_year
      || CASE WHEN p.character_limit IS NOT NULL THEN E'\nCharacter limit: ' || p.character_limit ELSE '' END
      || E'\nOfficial source: ' || p.source_url,
      '', p.word_limit, 'draft',
      -- Deliberate audience: these are assignments for the student to write;
      -- parents do not receive essay contents unless staff explicitly share.
      'student', 1, NEW.created_by_user_id, NEW.created_by_user_id)
    ON CONFLICT (firm_id, student_id, library_prompt_id) WHERE library_prompt_id IS NOT NULL DO NOTHING
    RETURNING id INTO draft_id;
    IF draft_id IS NOT NULL THEN
      INSERT INTO essay_draft_versions (essay_draft_id, version_number, body, created_by_user_id)
      VALUES (draft_id, 1, '', NEW.created_by_user_id);
    ELSE
      -- Re-adding a college relinks existing work without replacing text,
      -- review status, sharing choices or version history.
      UPDATE essay_drafts SET student_college_id=NEW.id
      WHERE firm_id=NEW.firm_id AND student_id=NEW.student_id AND library_prompt_id=p.id;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.assign_college_library_prompts() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER student_college_library_assignment AFTER INSERT ON student_colleges
  FOR EACH ROW EXECUTE FUNCTION public.assign_college_library_prompts();

CREATE FUNCTION public.link_library_essays_to_application() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  UPDATE essay_drafts SET application_id=NEW.id
  WHERE firm_id=NEW.firm_id AND student_id=NEW.student_id
    AND student_college_id=NEW.student_college_id
    AND library_prompt_id IS NOT NULL AND application_id IS NULL;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.link_library_essays_to_application() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER application_library_essay_link AFTER INSERT ON applications
  FOR EACH ROW EXECUTE FUNCTION public.link_library_essays_to_application();
