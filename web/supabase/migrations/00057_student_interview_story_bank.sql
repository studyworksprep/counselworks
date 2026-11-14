-- Student-owned interview responses; parent observations remain separate.
-- No existing profile fields or essay writing are rewritten.
CREATE FUNCTION public.interview_can_access(p_firm uuid,p_student uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT p_firm=public.firm_id() AND EXISTS (
  SELECT 1 FROM students s WHERE s.id=p_student AND s.firm_id=p_firm AND (
   public.current_member_role() IN ('firm_owner','firm_admin','read_only_staff')
   OR (public.current_member_role() IN ('counselor','essay_coach','tutor') AND EXISTS (
    SELECT 1 FROM student_staff_assignments a WHERE a.firm_id=p_firm AND a.student_id=s.id AND a.user_id=public.current_user_id()))
   OR (public.current_member_role()='student' AND s.user_id=public.current_user_id())
   OR (public.current_member_role()='parent_guardian' AND EXISTS (
    SELECT 1 FROM family_members f WHERE f.firm_id=p_firm AND f.family_id=s.family_id AND f.user_id=public.current_user_id()))
  ))
$$;
CREATE FUNCTION public.interview_can_write_bank(p_firm uuid,p_student uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT public.interview_can_access(p_firm,p_student) AND public.current_member_role() IN ('firm_owner','firm_admin','counselor','essay_coach','tutor','student')
$$;
CREATE TABLE student_interview_answers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),firm_id uuid NOT NULL REFERENCES firms(id),
 student_id uuid NOT NULL REFERENCES students(id),respondent_user_id uuid NOT NULL REFERENCES users(id),
 respondent_kind text NOT NULL CHECK(respondent_kind IN ('student','parent')),
 template_version integer NOT NULL DEFAULT 1 CHECK(template_version=1),
 question_key text NOT NULL CHECK(question_key ~ '^([A-J][1-8]|P[1-4]|R[1-8])$'),
 answer text NOT NULL DEFAULT '' CHECK(length(answer)<=12000),
 state text NOT NULL CHECK(state IN ('answered','unsure','skip','discuss')),
 audience text NOT NULL CHECK(audience IN ('counselor','family')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(firm_id,student_id,respondent_user_id,question_key)
);
CREATE TABLE student_interview_checkpoints (
 firm_id uuid NOT NULL REFERENCES firms(id),student_id uuid NOT NULL REFERENCES students(id),
 respondent_user_id uuid NOT NULL REFERENCES users(id),stage integer NOT NULL CHECK(stage BETWEEN 1 AND 3),
 reviewed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(firm_id,student_id,respondent_user_id,stage)
);
CREATE TABLE student_story_bank (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),firm_id uuid NOT NULL REFERENCES firms(id),
 student_id uuid NOT NULL REFERENCES students(id),kind text NOT NULL CHECK(kind IN ('story','narrative')),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 160),
 body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 12000),
 reflection text NOT NULL DEFAULT '' CHECK(length(reflection)<=6000),
 tags text[] NOT NULL DEFAULT '{}' CHECK(cardinality(tags)<=12),
 audience text NOT NULL CHECK(audience IN ('counselor','family')),
 review_state text NOT NULL CHECK(review_state IN ('draft','confirmed','revisit')),
 created_by_user_id uuid NOT NULL REFERENCES users(id),
 source_answer_id uuid REFERENCES student_interview_answers(id),
 story_ids uuid[] NOT NULL DEFAULT '{}' CHECK(cardinality(story_ids)<=20),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- Raw source text has its own policy; family-sharing a story never exposes it.
CREATE TABLE student_story_sources (
 entry_id uuid PRIMARY KEY REFERENCES student_story_bank(id) ON DELETE CASCADE,
 firm_id uuid NOT NULL REFERENCES firms(id),student_id uuid NOT NULL REFERENCES students(id),
 original_text text NOT NULL CHECK(length(original_text)<=12000)
);
CREATE INDEX story_sources_student ON student_story_sources(firm_id,student_id);
ALTER TABLE student_story_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON student_story_sources FROM anon,authenticated;
GRANT SELECT,INSERT ON student_story_sources TO authenticated;
GRANT ALL ON student_story_sources TO service_role;
CREATE POLICY story_sources_read ON student_story_sources FOR SELECT TO authenticated USING (
 public.interview_can_access(firm_id,student_id) AND (public.is_staff() OR public.current_member_role()='student'));
CREATE POLICY story_sources_insert ON student_story_sources FOR INSERT TO authenticated WITH CHECK (
 public.interview_can_write_bank(firm_id,student_id) AND EXISTS(SELECT 1 FROM student_story_bank b
 WHERE b.id=entry_id AND b.firm_id=student_story_sources.firm_id AND b.student_id=student_story_sources.student_id AND b.created_by_user_id=public.current_user_id() AND b.source_answer_id IS NOT NULL));
CREATE TABLE student_interview_followups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),firm_id uuid NOT NULL REFERENCES firms(id),
 student_id uuid NOT NULL REFERENCES students(id),recipient_user_id uuid NOT NULL REFERENCES users(id),
 created_by_user_id uuid NOT NULL REFERENCES users(id),
 source_answer_id uuid REFERENCES student_interview_answers(id),
 question text NOT NULL CHECK(length(btrim(question)) BETWEEN 1 AND 3000),
 reply text NOT NULL DEFAULT '' CHECK(length(reply)<=12000),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','answered','closed')),
 audience text NOT NULL CHECK(audience IN ('counselor','family')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE student_story_essay_links (
 firm_id uuid NOT NULL REFERENCES firms(id),student_id uuid NOT NULL REFERENCES students(id),
 entry_id uuid NOT NULL REFERENCES student_story_bank(id) ON DELETE CASCADE,
 essay_id uuid NOT NULL REFERENCES essay_drafts(id) ON DELETE CASCADE,
 created_by_user_id uuid NOT NULL REFERENCES users(id),PRIMARY KEY(entry_id,essay_id)
);
CREATE INDEX interview_answers_student ON student_interview_answers(firm_id,student_id);
CREATE INDEX interview_checkpoints_student ON student_interview_checkpoints(firm_id,student_id);
CREATE INDEX story_bank_student ON student_story_bank(firm_id,student_id);
CREATE INDEX interview_followups_student ON student_interview_followups(firm_id,student_id);
CREATE INDEX story_links_student ON student_story_essay_links(firm_id,student_id);
CREATE INDEX story_links_essay ON student_story_essay_links(essay_id);

-- A parent sees a narrative only while every supporting story is family-shared.
-- Story rows take the nonrecursive branch; no policy queries itself for a story.
CREATE FUNCTION public.interview_family_evidence(p_firm uuid,p_student uuid,p_ids uuid[])
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF coalesce(cardinality(p_ids),0)=0 THEN RETURN false; END IF;
 RETURN cardinality(p_ids)=(SELECT count(*) FROM student_story_bank s
 WHERE s.firm_id=p_firm AND s.student_id=p_student AND s.id=ANY(p_ids) AND s.kind='story' AND s.audience='family' AND s.review_state='confirmed');
END
$$;
ALTER TABLE student_interview_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_interview_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_story_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_interview_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_story_essay_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON student_interview_answers,student_interview_checkpoints,student_story_bank,student_interview_followups,student_story_essay_links FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON student_interview_answers,student_interview_checkpoints,student_story_bank,student_interview_followups TO authenticated;
GRANT SELECT,INSERT,DELETE ON student_story_essay_links TO authenticated;
GRANT ALL ON student_interview_answers,student_interview_checkpoints,student_story_bank,student_interview_followups,student_story_essay_links TO service_role;

CREATE POLICY interview_answers_read ON student_interview_answers FOR SELECT TO authenticated USING (
 public.interview_can_access(firm_id,student_id) AND (public.is_staff() OR respondent_user_id=public.current_user_id() OR audience='family'));
CREATE POLICY interview_answers_insert ON student_interview_answers FOR INSERT TO authenticated WITH CHECK (
 public.interview_can_access(firm_id,student_id) AND respondent_user_id=public.current_user_id() AND public.current_member_role() IN ('student','parent_guardian'));
CREATE POLICY interview_answers_update ON student_interview_answers FOR UPDATE TO authenticated USING (
 public.interview_can_access(firm_id,student_id) AND respondent_user_id=public.current_user_id()) WITH CHECK (
 public.interview_can_access(firm_id,student_id) AND respondent_user_id=public.current_user_id());
CREATE POLICY interview_checkpoints_read ON student_interview_checkpoints FOR SELECT TO authenticated USING (
 public.interview_can_access(firm_id,student_id) AND (public.is_staff() OR respondent_user_id=public.current_user_id()));
CREATE POLICY interview_checkpoints_insert ON student_interview_checkpoints FOR INSERT TO authenticated WITH CHECK (
 public.interview_can_access(firm_id,student_id) AND respondent_user_id=public.current_user_id() AND public.current_member_role() IN ('student','parent_guardian'));
CREATE POLICY interview_checkpoints_update ON student_interview_checkpoints FOR UPDATE TO authenticated USING (
 public.interview_can_access(firm_id,student_id) AND respondent_user_id=public.current_user_id()) WITH CHECK (
 public.interview_can_access(firm_id,student_id) AND respondent_user_id=public.current_user_id());
CREATE POLICY story_bank_read ON student_story_bank FOR SELECT TO authenticated USING (
 public.interview_can_access(firm_id,student_id) AND (
 public.is_staff() OR public.current_member_role()='student' OR (
 audience='family' AND review_state='confirmed' AND (kind='story' OR public.interview_family_evidence(firm_id,student_id,story_ids)))));
CREATE POLICY story_bank_insert ON student_story_bank FOR INSERT TO authenticated WITH CHECK (
 public.interview_can_write_bank(firm_id,student_id) AND created_by_user_id=public.current_user_id());
CREATE POLICY story_bank_update ON student_story_bank FOR UPDATE TO authenticated USING (
 public.interview_can_write_bank(firm_id,student_id)) WITH CHECK (public.interview_can_write_bank(firm_id,student_id));
CREATE POLICY interview_followups_read ON student_interview_followups FOR SELECT TO authenticated USING (
 public.interview_can_access(firm_id,student_id) AND (public.is_staff() OR recipient_user_id=public.current_user_id() OR audience='family'));
CREATE POLICY interview_followups_insert ON student_interview_followups FOR INSERT TO authenticated WITH CHECK (
 public.interview_can_write_bank(firm_id,student_id) AND public.current_member_role()<>'student' AND created_by_user_id=public.current_user_id());
CREATE POLICY interview_followups_update ON student_interview_followups FOR UPDATE TO authenticated USING (
 public.interview_can_access(firm_id,student_id) AND (public.interview_can_write_bank(firm_id,student_id) OR recipient_user_id=public.current_user_id()))
 WITH CHECK(public.interview_can_access(firm_id,student_id));
CREATE POLICY story_links_read ON student_story_essay_links FOR SELECT TO authenticated USING (
 public.interview_can_access(firm_id,student_id)
 AND EXISTS(SELECT 1 FROM student_story_bank b WHERE b.id=entry_id AND b.firm_id=student_story_essay_links.firm_id AND b.student_id=student_story_essay_links.student_id)
 AND EXISTS(SELECT 1 FROM essay_drafts e WHERE e.id=essay_id AND e.firm_id=student_story_essay_links.firm_id AND e.student_id=student_story_essay_links.student_id
 AND (public.is_staff() OR (public.current_member_role()='student' AND e.visibility_scope IN ('student','family','firm')) OR (public.current_member_role()='parent_guardian' AND e.visibility_scope IN ('family','firm')))));
CREATE POLICY story_links_insert ON student_story_essay_links FOR INSERT TO authenticated WITH CHECK (
 public.interview_can_write_bank(firm_id,student_id) AND created_by_user_id=public.current_user_id());
CREATE POLICY story_links_delete ON student_story_essay_links FOR DELETE TO authenticated USING (
 public.interview_can_write_bank(firm_id,student_id));

CREATE FUNCTION public.guard_interview_answer() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r text;
BEGIN
 IF current_user IN ('postgres','service_role') THEN RETURN NEW; END IF;
 r:=public.work_actor(NEW.firm_id,public.current_user_id(),NEW.student_id);
 IF NEW.respondent_user_id IS DISTINCT FROM public.current_user_id()
 OR (NEW.respondent_kind='student' AND r<>'student') OR (NEW.respondent_kind='parent' AND r<>'parent_guardian')
 THEN RAISE EXCEPTION 'Only the respondent can change an interview response'; END IF;
 IF (NEW.respondent_kind='parent' AND NEW.question_key !~ '^R[1-8]$')
 OR (NEW.respondent_kind='student' AND NEW.question_key NOT IN ('A1','A2','A3','A4','A5','B1','B2','B3','B4','B5','B6','B7','C1','C2','C3','C4','C5','C6','D1','D2','D3','D4','D5','E1','E2','E3','E4','E5','E6','F1','F2','F3','F4','F5','G1','G2','G3','G4','G5','G6','H1','H2','H3','H4','H5','H6','H7','H8','I1','I2','I3','I4','J1','J2','J3','J4','J5','J6','P1','P2','P3','P4'))
 THEN RAISE EXCEPTION 'Unknown interview question'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.id,NEW.firm_id,NEW.student_id,NEW.respondent_user_id,NEW.respondent_kind,NEW.question_key,NEW.template_version)
    IS DISTINCT FROM (OLD.id,OLD.firm_id,OLD.student_id,OLD.respondent_user_id,OLD.respondent_kind,OLD.question_key,OLD.template_version)
  THEN RAISE EXCEPTION 'Response identity cannot change'; END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Response changed; reload before saving'; END IF;
 ELSE
  IF NEW.revision<>1 THEN RAISE EXCEPTION 'Invalid initial revision'; END IF;
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER guard_interview_answer BEFORE INSERT OR UPDATE ON student_interview_answers FOR EACH ROW EXECUTE FUNCTION public.guard_interview_answer();
CREATE FUNCTION public.guard_interview_checkpoint() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF current_user IN ('postgres','service_role') THEN RETURN NEW; END IF;
 IF NEW.respondent_user_id IS DISTINCT FROM public.current_user_id() OR public.work_actor(NEW.firm_id,public.current_user_id(),NEW.student_id) NOT IN ('student','parent_guardian')
 THEN RAISE EXCEPTION 'Only the respondent can review an interview stage'; END IF;
 IF TG_OP='UPDATE' AND (NEW.firm_id,NEW.student_id,NEW.respondent_user_id,NEW.stage) IS DISTINCT FROM (OLD.firm_id,OLD.student_id,OLD.respondent_user_id,OLD.stage) THEN RAISE EXCEPTION 'Review identity cannot change'; END IF;
 NEW.reviewed_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER guard_interview_checkpoint BEFORE INSERT OR UPDATE ON student_interview_checkpoints FOR EACH ROW EXECUTE FUNCTION public.guard_interview_checkpoint();

CREATE FUNCTION public.guard_story_bank() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r text; a student_interview_answers; n integer;
BEGIN
 IF current_user IN ('postgres','service_role') THEN RETURN NEW; END IF;
 r:=public.work_actor(NEW.firm_id,public.current_user_id(),NEW.student_id);
 IF r NOT IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Story editing access required'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.created_by_user_id IS DISTINCT FROM public.current_user_id() OR NEW.revision<>1 THEN RAISE EXCEPTION 'Invalid story author'; END IF;
  IF NEW.source_answer_id IS NOT NULL THEN
   SELECT * INTO a FROM student_interview_answers WHERE id=NEW.source_answer_id AND firm_id=NEW.firm_id AND student_id=NEW.student_id AND respondent_kind='student';
   IF NOT FOUND THEN RAISE EXCEPTION 'Only a student response can become a story'; END IF;
  END IF;
 ELSE
  IF (NEW.id,NEW.firm_id,NEW.student_id,NEW.kind,NEW.created_by_user_id,NEW.source_answer_id)
   IS DISTINCT FROM (OLD.id,OLD.firm_id,OLD.student_id,OLD.kind,OLD.created_by_user_id,OLD.source_answer_id)
  THEN RAISE EXCEPTION 'Original story source cannot change'; END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Story changed; reload before saving'; END IF;
 END IF;
 IF r<>'student' THEN
  IF TG_OP='INSERT' AND (NEW.audience<>'counselor' OR NEW.review_state<>'draft') THEN RAISE EXCEPTION 'Student chooses confirmation and family sharing'; END IF;
  IF TG_OP='UPDATE' AND NEW.audience<>OLD.audience THEN RAISE EXCEPTION 'Student chooses family sharing'; END IF;
  IF TG_OP='UPDATE' AND NEW.review_state='confirmed' AND
    (OLD.review_state<>'confirmed' OR NEW.title<>OLD.title OR NEW.body<>OLD.body OR NEW.reflection<>OLD.reflection OR NEW.tags<>OLD.tags OR NEW.story_ids<>OLD.story_ids)
   THEN RAISE EXCEPTION 'Student confirms revised stories and narratives'; END IF;
 END IF;
 IF NEW.kind='story' AND cardinality(NEW.story_ids)>0 THEN RAISE EXCEPTION 'Stories cannot contain narrative links'; END IF;
 IF NEW.kind='narrative' THEN
  IF NEW.source_answer_id IS NOT NULL THEN RAISE EXCEPTION 'Narratives use supporting stories'; END IF;
  SELECT count(DISTINCT id) INTO n FROM student_story_bank WHERE id=ANY(NEW.story_ids) AND firm_id=NEW.firm_id AND student_id=NEW.student_id AND kind='story';
  IF n<>cardinality(NEW.story_ids) THEN RAISE EXCEPTION 'Supporting stories must belong to this student'; END IF;
  IF NEW.review_state='confirmed' AND (n=0 OR EXISTS(SELECT 1 FROM student_story_bank WHERE id=ANY(NEW.story_ids) AND review_state<>'confirmed')) THEN RAISE EXCEPTION 'Confirm at least one supporting story first'; END IF;
  IF NEW.audience='family' AND NOT public.interview_family_evidence(NEW.firm_id,NEW.student_id,NEW.story_ids) THEN RAISE EXCEPTION 'Share every supporting story before sharing this narrative'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM unnest(NEW.tags) t WHERE length(t) NOT BETWEEN 1 AND 40) THEN RAISE EXCEPTION 'Invalid story tag'; END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER guard_story_bank BEFORE INSERT OR UPDATE ON student_story_bank FOR EACH ROW EXECUTE FUNCTION public.guard_story_bank();
CREATE FUNCTION public.capture_story_source() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.source_answer_id IS NOT NULL THEN
  INSERT INTO student_story_sources(entry_id,firm_id,student_id,original_text)
  SELECT NEW.id,NEW.firm_id,NEW.student_id,a.answer FROM student_interview_answers a
   WHERE a.id=NEW.source_answer_id AND a.firm_id=NEW.firm_id AND a.student_id=NEW.student_id AND a.respondent_kind='student';
  IF NOT FOUND THEN RAISE EXCEPTION 'Original student response not available'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER capture_story_source AFTER INSERT ON student_story_bank FOR EACH ROW EXECUTE FUNCTION public.capture_story_source();
CREATE FUNCTION public.guard_story_source() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM student_story_bank b JOIN student_interview_answers a ON a.id=b.source_answer_id
 WHERE b.id=NEW.entry_id AND b.firm_id=NEW.firm_id AND b.student_id=NEW.student_id
 AND a.firm_id=NEW.firm_id AND a.student_id=NEW.student_id AND a.respondent_kind='student' AND a.answer=NEW.original_text)
 THEN RAISE EXCEPTION 'Original source must match the student response'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_story_source BEFORE INSERT ON student_story_sources FOR EACH ROW EXECUTE FUNCTION public.guard_story_source();
CREATE FUNCTION public.revisit_story_narratives() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.kind='story' AND (NEW.title,NEW.body,NEW.reflection,NEW.tags,NEW.review_state) IS DISTINCT FROM (OLD.title,OLD.body,OLD.reflection,OLD.tags,OLD.review_state) THEN
  UPDATE student_story_bank SET review_state='revisit',revision=revision+1 WHERE firm_id=NEW.firm_id AND student_id=NEW.student_id AND kind='narrative' AND NEW.id=ANY(story_ids) AND review_state='confirmed';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER revisit_story_narratives AFTER UPDATE ON student_story_bank FOR EACH ROW EXECUTE FUNCTION public.revisit_story_narratives();

CREATE FUNCTION public.guard_interview_followup() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r text;
BEGIN
 IF current_user IN ('postgres','service_role') THEN RETURN NEW; END IF;
 r:=public.work_actor(NEW.firm_id,public.current_user_id(),NEW.student_id);
 IF TG_OP='INSERT' THEN
  IF r NOT IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') OR NEW.created_by_user_id IS DISTINCT FROM public.current_user_id()
   OR NEW.reply<>'' OR NEW.status<>'open' OR NEW.audience<>'counselor' OR NEW.revision<>1
  THEN RAISE EXCEPTION 'Counselor follow-up starts with its recipient and counseling team'; END IF;
  IF NOT EXISTS(SELECT 1 FROM students s WHERE s.id=NEW.student_id AND s.firm_id=NEW.firm_id AND (
   s.user_id=NEW.recipient_user_id OR EXISTS(SELECT 1 FROM family_members f JOIN firm_memberships m ON m.firm_id=f.firm_id AND m.user_id=f.user_id
    WHERE f.firm_id=NEW.firm_id AND f.family_id=s.family_id AND f.user_id=NEW.recipient_user_id AND m.role='parent_guardian' AND m.status='active')))
  THEN RAISE EXCEPTION 'Follow-up recipient does not belong to this student'; END IF;
  IF NEW.source_answer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM student_interview_answers a WHERE a.id=NEW.source_answer_id AND a.firm_id=NEW.firm_id AND a.student_id=NEW.student_id AND a.respondent_user_id=NEW.recipient_user_id)
  THEN RAISE EXCEPTION 'Follow-up source must belong to its recipient'; END IF;
 ELSE
  IF (NEW.id,NEW.firm_id,NEW.student_id,NEW.recipient_user_id,NEW.created_by_user_id,NEW.source_answer_id,NEW.question)
   IS DISTINCT FROM (OLD.id,OLD.firm_id,OLD.student_id,OLD.recipient_user_id,OLD.created_by_user_id,OLD.source_answer_id,OLD.question)
  THEN RAISE EXCEPTION 'Follow-up identity cannot change'; END IF;
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Follow-up changed; reload before saving'; END IF;
  IF NEW.recipient_user_id=public.current_user_id() THEN
   IF OLD.status='closed' OR NEW.status<>'answered' OR length(btrim(NEW.reply))=0 THEN RAISE EXCEPTION 'Reply to an open follow-up'; END IF;
  ELSIF r IN ('firm_owner','firm_admin','counselor','essay_coach','tutor') THEN
   IF NEW.reply<>OLD.reply OR NEW.audience<>OLD.audience OR NEW.status NOT IN ('closed','open') THEN RAISE EXCEPTION 'Counselors can close or reopen; only the recipient edits the reply'; END IF;
  ELSE RAISE EXCEPTION 'Follow-up editing access required'; END IF;
 END IF;
 NEW.updated_at:=now();RETURN NEW;
END $$;
CREATE TRIGGER guard_interview_followup BEFORE INSERT OR UPDATE ON student_interview_followups FOR EACH ROW EXECUTE FUNCTION public.guard_interview_followup();
CREATE FUNCTION public.guard_story_essay_link() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF current_user IN ('postgres','service_role') THEN RETURN NEW; END IF;
 IF NOT public.interview_can_write_bank(NEW.firm_id,NEW.student_id) OR NEW.created_by_user_id IS DISTINCT FROM public.current_user_id()
 OR NOT EXISTS(SELECT 1 FROM student_story_bank b WHERE b.id=NEW.entry_id AND b.firm_id=NEW.firm_id AND b.student_id=NEW.student_id AND b.kind='story')
 OR NOT EXISTS(SELECT 1 FROM essay_drafts e WHERE e.id=NEW.essay_id AND e.firm_id=NEW.firm_id AND e.student_id=NEW.student_id AND
  (public.is_staff() OR e.visibility_scope IN ('student','family','firm')))
 THEN RAISE EXCEPTION 'Story and essay must be accessible and belong to this student'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_story_essay_link BEFORE INSERT ON student_story_essay_links FOR EACH ROW EXECUTE FUNCTION public.guard_story_essay_link();
REVOKE ALL ON FUNCTION public.interview_can_access(uuid,uuid),public.interview_can_write_bank(uuid,uuid),public.interview_family_evidence(uuid,uuid,uuid[]),
 public.capture_story_source(),public.guard_story_source(),public.guard_interview_answer(),public.guard_interview_checkpoint(),public.guard_story_bank(),public.revisit_story_narratives(),public.guard_interview_followup(),public.guard_story_essay_link() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.interview_can_access(uuid,uuid),public.interview_can_write_bank(uuid,uuid),public.interview_family_evidence(uuid,uuid,uuid[]) TO authenticated,service_role;
