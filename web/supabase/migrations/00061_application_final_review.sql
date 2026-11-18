-- A packet freezes only submission material. Coaching/source text never enters it.
-- Approvals belong to this exact snapshot; freshness is derived from live inputs.
CREATE TABLE application_review_packets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 firm_id uuid NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
 application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
 number integer NOT NULL DEFAULT 1, revision integer NOT NULL DEFAULT 1,
 fingerprint text NOT NULL, manifest jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), created_by_user_id uuid NOT NULL REFERENCES users(id),
 updated_by_user_id uuid NOT NULL REFERENCES users(id),
 student_approved_at timestamptz, student_approved_by uuid REFERENCES users(id),
 counselor_approved_at timestamptz, counselor_approved_by uuid REFERENCES users(id),
 family_shared boolean NOT NULL DEFAULT false,
 submitted_on date, submission_platform text, submission_confirmation text, recorded_at timestamptz,
 UNIQUE(firm_id,application_id,number),
 CHECK(number>0 AND revision>0 AND fingerprint ~ '^[a-f0-9]{32}$'),
 CHECK((student_approved_at IS NULL)=(student_approved_by IS NULL)),
 CHECK((counselor_approved_at IS NULL)=(counselor_approved_by IS NULL)),
 CHECK(NOT family_shared OR student_approved_at IS NOT NULL),
 CHECK(submission_platform IS NULL OR submission_platform IN ('Common App','Coalition / Scoir','College portal','Other')),
 CHECK(submission_confirmation IS NULL OR length(submission_confirmation)<=200),
 CHECK((submitted_on IS NULL AND submission_platform IS NULL AND submission_confirmation IS NULL AND recorded_at IS NULL)
   OR (submitted_on IS NOT NULL AND submission_platform IS NOT NULL AND recorded_at IS NOT NULL AND student_approved_at IS NOT NULL AND counselor_approved_at IS NOT NULL))
);
CREATE INDEX application_review_student ON application_review_packets(firm_id,student_id);
CREATE UNIQUE INDEX application_review_one_submission ON application_review_packets(firm_id,application_id) WHERE submitted_on IS NOT NULL;
ALTER TABLE application_review_packets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON application_review_packets FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON application_review_packets TO authenticated;
GRANT ALL ON application_review_packets TO service_role;
-- An opaque pointer lets every role reject a superseded packet even when RLS
-- hides the newer packet's writing after a source-sharing withdrawal.
ALTER TABLE applications ADD COLUMN latest_review_packet_id uuid REFERENCES application_review_packets(id) ON DELETE SET NULL;

-- Parents receive a student-approved snapshot only while EVERY included essay
-- still permits family access and has exactly that current writing/version.
-- This does not open the existing saved-version or feedback tables to parents.
CREATE FUNCTION public.application_packet_visible(p_firm uuid,p_student uuid,p_manifest jsonb,p_family boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(p_manifest->'essays') item
  WHERE NOT EXISTS (SELECT 1 FROM essay_drafts e WHERE e.firm_id=p_firm AND e.student_id=p_student AND e.id=(item->>'id')::uuid
   AND e.visibility_scope=ANY(CASE WHEN p_family THEN ARRAY['family','firm'] ELSE ARRAY['student','family','firm'] END)
   AND (NOT p_family OR (e.current_version_number=(item->>'version')::integer AND coalesce(e.body,'')=item->>'body'
    AND coalesce(e.prompt_text,'')=item->>'prompt' AND coalesce(e.word_count_limit,e.word_count_target) IS NOT DISTINCT FROM (item->>'wordLimit')::integer
    AND e.character_count_limit IS NOT DISTINCT FROM (item->>'characterLimit')::integer))))
  AND jsonb_typeof(p_manifest->'essays')='array';
$$;
CREATE POLICY application_packets_read ON application_review_packets FOR SELECT TO authenticated USING (
 public.interview_can_access(firm_id,student_id) AND (public.is_staff()
  OR (public.current_member_role()='student' AND public.application_packet_visible(firm_id,student_id,manifest,false))
  OR (public.current_member_role()='parent_guardian' AND family_shared AND student_approved_at IS NOT NULL
    AND public.application_packet_visible(firm_id,student_id,manifest,true))));
CREATE POLICY application_packets_insert ON application_review_packets FOR INSERT TO authenticated WITH CHECK (
 public.interview_can_write_bank(firm_id,student_id) AND created_by_user_id=public.current_user_id());
CREATE POLICY application_packets_update ON application_review_packets FOR UPDATE TO authenticated USING (
 public.interview_can_write_bank(firm_id,student_id)) WITH CHECK(public.interview_can_write_bank(firm_id,student_id));

CREATE FUNCTION public.application_review_preview(p_firm uuid,p_actor uuid,p_application uuid,p_general uuid[] DEFAULT '{}')
-- VOLATILE deliberately takes fresh read snapshots after source row locks wait.
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=public AS $$
DECLARE a applications; r text; e record; ps college_prompt_sets; lp record; manifest jsonb; essays jsonb:='[]'::jsonb;
 blockers jsonb:='[]'::jsonb; warnings jsonb:='[]'::jsonb; working jsonb:='[]'::jsonb; tasks_state jsonb; prompts_state jsonb;
 ids uuid[]:='{}'::uuid[]; words integer; characters integer; school text; entry integer; sc integer; general_ids uuid[];
BEGIN
 SELECT * INTO a FROM applications WHERE id=p_application AND firm_id=p_firm;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
 r:=public.work_actor(p_firm,p_actor,a.student_id);
 IF r='parent_guardian' THEN RAISE EXCEPTION 'Final review is managed by the student and counseling team'; END IF;
 SELECT coalesce(array_agg(DISTINCT x ORDER BY x),'{}') INTO general_ids FROM unnest(p_general) x;
 IF p_general IS NULL OR cardinality(p_general)>20 OR cardinality(general_ids)<>cardinality(p_general) THEN RAISE EXCEPTION 'Choose each general essay once'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(general_ids) g WHERE NOT EXISTS(SELECT 1 FROM essay_drafts d
  WHERE d.id=g AND d.firm_id=p_firm AND d.student_id=a.student_id AND d.application_id IS NULL AND d.student_college_id IS NULL AND d.visibility_scope IN ('student','family','firm')))
 THEN RAISE EXCEPTION 'Choose an available general essay for this student'; END IF;
 SELECT c.name,c.scorecard_id INTO school,sc FROM colleges c WHERE c.id=a.college_id;
 SELECT graduation_year INTO entry FROM students WHERE id=a.student_id AND firm_id=p_firm;
 SELECT * INTO ps FROM college_prompt_sets WHERE scorecard_id=sc AND entry_year=entry AND review_state='published'
  AND (firm_id IS NULL OR firm_id=p_firm) ORDER BY (firm_id IS NOT NULL) DESC,published_at DESC NULLS LAST,id LIMIT 1;
 IF ps.id IS NULL OR ps.coverage='needs_review' THEN warnings:=warnings||jsonb_build_array('Prompt coverage needs a check against the current college application.'); END IF;
 IF a.deadline_source<>'explicit' THEN warnings:=warnings||jsonb_build_array('Confirm the deadline in the college application.'); END IF;
 IF jsonb_typeof(a.checklist_json) IS DISTINCT FROM 'array' OR a.checklist_json='[]' THEN
  warnings:=warnings||jsonb_build_array('No application checklist is recorded. Verify all non-writing requirements in the college portal.');
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(a.checklist_json) c WHERE c->'done' IS DISTINCT FROM 'true'::jsonb) THEN
  blockers:=blockers||jsonb_build_array('Complete the application checklist before approving this packet.');
 END IF;
 FOR e IN SELECT d.id,d.title,d.prompt_text,d.body,d.current_version_number,d.status,d.word_count_limit,d.word_count_target,d.character_count_limit,
   d.library_prompt_id,d.library_prompt_slot,d.library_prompt_snapshot,d.application_id,d.student_college_id,
   v.id AS version_id,v.body AS saved_body
  FROM essay_drafts d LEFT JOIN essay_draft_versions v ON v.essay_draft_id=d.id AND v.version_number=d.current_version_number
  WHERE d.firm_id=p_firm AND d.student_id=a.student_id AND d.visibility_scope IN ('student','family','firm')
   AND (d.application_id=a.id OR (d.application_id IS NULL AND d.student_college_id=a.student_college_id) OR d.id=ANY(general_ids)) ORDER BY d.id
 LOOP
  ids:=array_append(ids,e.id);
  words:=CASE WHEN btrim(coalesce(e.saved_body,''))='' THEN 0 ELSE cardinality(regexp_split_to_array(btrim(e.saved_body),'\s+')) END;
  characters:=length(coalesce(e.saved_body,''));
  IF e.version_id IS NULL OR coalesce(e.saved_body,'') IS DISTINCT FROM coalesce(e.body,'') THEN blockers:=blockers||jsonb_build_array(coalesce(e.title,'Untitled response')||': save the current writing as a version.'); END IF;
  IF words=0 THEN blockers:=blockers||jsonb_build_array(coalesce(e.title,'Untitled response')||': the saved response is empty.'); END IF;
  IF (coalesce(e.word_count_limit,e.word_count_target) IS NOT NULL AND words>coalesce(e.word_count_limit,e.word_count_target))
   OR (e.character_count_limit IS NOT NULL AND characters>e.character_count_limit) THEN
   blockers:=blockers||jsonb_build_array(coalesce(e.title,'Untitled response')||': the saved response exceeds its limit.'); END IF;
  IF e.status='revision_requested' THEN blockers:=blockers||jsonb_build_array(coalesce(e.title,'Untitled response')||': resolve the requested revision and resubmit for review.'); END IF;
  SELECT p.* INTO lp FROM college_library_prompts p WHERE p.prompt_set_id=ps.id
   AND (p.id=e.library_prompt_id OR (sc::text||':'||entry::text||':'||p.prompt_key)=e.library_prompt_slot) LIMIT 1;
  IF lp.id IS NOT NULL AND lp.id IS DISTINCT FROM e.library_prompt_id THEN
   warnings:=warnings||jsonb_build_array(coalesce(e.title,'Untitled response')||': published requirements changed; check the assigned question against the current application.');
   IF (lp.word_limit IS NOT NULL AND words>lp.word_limit) OR (lp.character_limit IS NOT NULL AND characters>lp.character_limit) THEN
    blockers:=blockers||jsonb_build_array(coalesce(e.title,'Untitled response')||': the saved response exceeds the current published limit.'); END IF;
  END IF;
  essays:=essays||jsonb_build_array(jsonb_build_object('id',e.id,'title',coalesce(e.title,'Untitled response'),'prompt',coalesce(e.prompt_text,''),'body',coalesce(e.saved_body,''),
   'versionId',e.version_id,'version',e.current_version_number,'wordLimit',coalesce(e.word_count_limit,e.word_count_target),'characterLimit',e.character_count_limit,
   'words',words,'characters',characters,'general',e.id=ANY(general_ids)));
  working:=working||jsonb_build_array(jsonb_build_object('id',e.id,'body',e.body,'status',e.status,'prompt',e.library_prompt_snapshot,'slot',e.library_prompt_slot,'promptId',e.library_prompt_id));
 END LOOP;
 IF cardinality(ids)>200 THEN RAISE EXCEPTION 'Too many responses for one application packet'; END IF;
 IF ps.coverage='verified' AND EXISTS(SELECT 1 FROM college_library_prompts p WHERE p.prompt_set_id=ps.id AND p.requirement='required' AND NOT EXISTS(
  SELECT 1 FROM essay_drafts d WHERE d.firm_id=p_firm AND d.student_id=a.student_id AND d.id=ANY(ids)
   AND (d.library_prompt_id=p.id OR d.library_prompt_slot=(sc::text||':'||entry::text||':'||p.prompt_key)))) THEN
  blockers:=blockers||jsonb_build_array('Required college responses are missing. Review the essay planning board with your counselor.'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'status',t.status,'updated',t.updated_at) ORDER BY t.id),'[]') INTO tasks_state FROM tasks t
  WHERE t.firm_id=p_firm AND t.student_id=a.student_id AND t.archived_at IS NULL AND t.visibility_scope IN ('student','family','firm')
   AND t.essay_feedback_id IS NOT NULL AND t.related_entity_type='essay' AND t.related_entity_id=ANY(ids) AND t.status NOT IN ('completed','cancelled');
 IF tasks_state<>'[]' THEN blockers:=blockers||jsonb_build_array('Complete the open essay revision tasks before approval.'); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'text',p.prompt_text,'words',p.word_limit,'characters',p.character_limit,'requirement',p.requirement) ORDER BY p.id),'[]')
  INTO prompts_state FROM college_library_prompts p WHERE p.prompt_set_id=ps.id;
 manifest:=jsonb_build_object('college',coalesce(school,'College'),'round',a.application_type,'deadline',a.deadline_at,'generalEssayIds',to_jsonb(general_ids),'essays',essays);
 RETURN jsonb_build_object('manifest',manifest,'blockers',blockers,'warnings',warnings,'fingerprint',
  md5(jsonb_build_object('manifest',manifest,'working',working,'checklist',a.checklist_json,'year',entry,'set',ps.id,'coverage',ps.coverage,
    'prompts',prompts_state,'tasks',tasks_state,'deadlineSource',a.deadline_source,'blockers',blockers,'warnings',warnings)::text));
END $$;

-- Students may lock their application during review, and record only a verified
-- packet handoff. The trigger below prevents using this policy to edit other fields.
CREATE POLICY application_student_handoff ON applications FOR UPDATE TO authenticated
 USING (public.current_member_role()='student' AND public.interview_can_write_bank(firm_id,student_id))
 WITH CHECK(public.current_member_role()='student' AND public.interview_can_write_bank(firm_id,student_id));
CREATE FUNCTION public.guard_student_application_handoff() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF current_user IN ('postgres','service_role') THEN RETURN NEW; END IF;
 IF public.current_member_role() IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor')
  AND (to_jsonb(NEW)-ARRAY['latest_review_packet_id','updated_at','updated_by_user_id']) IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['latest_review_packet_id','updated_at','updated_by_user_id'])
  AND NEW.latest_review_packet_id IS DISTINCT FROM OLD.latest_review_packet_id AND NEW.updated_by_user_id=public.current_user_id()
  AND EXISTS(SELECT 1 FROM application_review_packets p WHERE p.id=NEW.latest_review_packet_id AND p.firm_id=NEW.firm_id AND p.student_id=NEW.student_id AND p.application_id=NEW.id
   AND p.created_by_user_id=public.current_user_id() AND p.number=CASE WHEN OLD.latest_review_packet_id IS NULL THEN 1 ELSE
    (SELECT previous.number+1 FROM application_review_packets previous WHERE previous.id=OLD.latest_review_packet_id AND previous.firm_id=OLD.firm_id AND previous.application_id=OLD.id) END)
 THEN RETURN NEW; END IF;
 IF NEW.latest_review_packet_id IS DISTINCT FROM OLD.latest_review_packet_id THEN RAISE EXCEPTION 'Prepare a new packet to update the current review'; END IF;
 IF public.current_member_role()<>'student' THEN RETURN NEW; END IF;
 IF (to_jsonb(NEW)-ARRAY['stage','submitted_at','updated_at','updated_by_user_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['stage','submitted_at','updated_at','updated_by_user_id'])
  OR OLD.stage NOT IN ('not_started','in_progress','submitted') OR NEW.stage<>'submitted' OR NEW.updated_by_user_id IS DISTINCT FROM public.current_user_id()
  OR NOT EXISTS(SELECT 1 FROM application_review_packets p WHERE p.firm_id=NEW.firm_id AND p.student_id=NEW.student_id AND p.application_id=NEW.id
   AND p.submitted_on IS NOT NULL AND NEW.submitted_at=(p.submitted_on::timestamp AT TIME ZONE coalesce((SELECT timezone FROM firms WHERE id=NEW.firm_id),'America/New_York')) AND p.updated_by_user_id=public.current_user_id()
   AND p.student_approved_at IS NOT NULL AND p.counselor_approved_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Record submission through an approved application packet'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_student_application_handoff BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION public.guard_student_application_handoff();

CREATE FUNCTION public.guard_application_packet() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a applications; r text; preview jsonb; general_ids uuid[]; approving boolean:=false; zone text;
BEGIN
 SELECT * INTO a FROM applications WHERE firm_id=NEW.firm_id AND student_id=NEW.student_id AND id=NEW.application_id FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
 r:=public.work_actor(NEW.firm_id,NEW.updated_by_user_id,NEW.student_id);
 SELECT coalesce(timezone,'America/New_York') INTO zone FROM firms WHERE id=NEW.firm_id;
 IF r NOT IN ('student','firm_owner','firm_admin','counselor','essay_coach','tutor') THEN RAISE EXCEPTION 'Application review editing access required'; END IF;
 -- Serialize with existing essay saves. A later save immediately changes freshness.
 PERFORM id FROM essay_drafts WHERE firm_id=NEW.firm_id AND student_id=NEW.student_id ORDER BY id FOR SHARE;
 SELECT coalesce(array_agg(value::uuid),'{}') INTO general_ids FROM jsonb_array_elements_text(NEW.manifest->'generalEssayIds');
 IF TG_OP='INSERT' THEN
  IF a.latest_review_packet_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM application_review_packets previous WHERE previous.id=a.latest_review_packet_id AND previous.firm_id=NEW.firm_id AND previous.application_id=a.id
   AND (r<>'student' OR public.application_packet_visible(NEW.firm_id,NEW.student_id,previous.manifest,false))) THEN
   RAISE EXCEPTION 'Ask your counselor to prepare an updated packet after sharing changes'; END IF;
  IF NEW.created_by_user_id IS DISTINCT FROM NEW.updated_by_user_id OR NEW.student_approved_at IS NOT NULL OR NEW.counselor_approved_at IS NOT NULL
   OR NEW.student_approved_by IS NOT NULL OR NEW.counselor_approved_by IS NOT NULL OR NEW.family_shared OR NEW.submitted_on IS NOT NULL
   OR NEW.submission_platform IS NOT NULL OR NEW.submission_confirmation IS NOT NULL OR NEW.recorded_at IS NOT NULL THEN RAISE EXCEPTION 'New packets start without approvals or sharing'; END IF;
  IF a.stage IN ('withdrawn','under_review','decision_received') OR EXISTS(SELECT 1 FROM application_review_packets WHERE firm_id=NEW.firm_id AND application_id=a.id AND submitted_on IS NOT NULL)
   THEN RAISE EXCEPTION 'This application has already been handed off or closed'; END IF;
  preview:=public.application_review_preview(NEW.firm_id,NEW.updated_by_user_id,a.id,general_ids);
  IF NEW.fingerprint IS DISTINCT FROM preview->>'fingerprint' THEN RAISE EXCEPTION 'The application changed. Refresh and review the latest writing before preparing a packet'; END IF;
  NEW.manifest:=preview->'manifest'; NEW.revision:=1; NEW.created_at:=now();
  SELECT coalesce(max(number),0)+1 INTO NEW.number FROM application_review_packets WHERE firm_id=NEW.firm_id AND application_id=a.id;
  RETURN NEW;
 END IF;
 IF (to_jsonb(NEW)-ARRAY['revision','updated_by_user_id','student_approved_at','student_approved_by','counselor_approved_at','counselor_approved_by','family_shared','submitted_on','submission_platform','submission_confirmation','recorded_at'])
  IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','updated_by_user_id','student_approved_at','student_approved_by','counselor_approved_at','counselor_approved_by','family_shared','submitted_on','submission_platform','submission_confirmation','recorded_at'])
  OR NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'Packet changed in another window. Refresh before continuing'; END IF;
 IF OLD.submitted_on IS NOT NULL AND (to_jsonb(NEW)-ARRAY['revision','updated_by_user_id','family_shared']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','updated_by_user_id','family_shared']) THEN
  RAISE EXCEPTION 'A recorded submission and its approvals cannot be changed'; END IF;
 IF (NEW.student_approved_at,NEW.student_approved_by) IS DISTINCT FROM (OLD.student_approved_at,OLD.student_approved_by) THEN
  IF r<>'student' THEN RAISE EXCEPTION 'Only the student can approve or withdraw their approval'; END IF;
  IF NEW.student_approved_at IS NULL THEN NEW.student_approved_by:=NULL;NEW.family_shared:=false;
  ELSE NEW.student_approved_by:=NEW.updated_by_user_id;NEW.student_approved_at:=clock_timestamp();approving:=true; END IF;
 END IF;
 IF (NEW.counselor_approved_at,NEW.counselor_approved_by) IS DISTINCT FROM (OLD.counselor_approved_at,OLD.counselor_approved_by) THEN
  IF r='student' THEN RAISE EXCEPTION 'Only the counseling team can give counselor approval'; END IF;
  IF NEW.counselor_approved_at IS NULL THEN NEW.counselor_approved_by:=NULL;
  ELSE NEW.counselor_approved_by:=NEW.updated_by_user_id;NEW.counselor_approved_at:=clock_timestamp();approving:=true; END IF;
 END IF;
 IF NEW.family_shared IS DISTINCT FROM OLD.family_shared THEN
  IF r<>'student' THEN RAISE EXCEPTION 'Only the student chooses parent access'; END IF;
  IF NEW.family_shared AND (NEW.student_approved_at IS NULL OR NOT public.application_packet_visible(NEW.firm_id,NEW.student_id,NEW.manifest,true)) THEN
   RAISE EXCEPTION 'Approve the packet and share every included essay with family first'; END IF;
 END IF;
 IF (NEW.submitted_on,NEW.submission_platform,NEW.submission_confirmation,NEW.recorded_at) IS DISTINCT FROM (OLD.submitted_on,OLD.submission_platform,OLD.submission_confirmation,OLD.recorded_at) THEN
  IF r<>'student' OR OLD.submitted_on IS NOT NULL OR NEW.submitted_on IS NULL OR NEW.submitted_on>(now() AT TIME ZONE zone)::date
   OR NEW.submitted_on<(OLD.created_at AT TIME ZONE zone)::date OR NEW.submission_platform IS NULL OR NEW.student_approved_at IS NULL OR NEW.counselor_approved_at IS NULL
   OR a.stage NOT IN ('not_started','in_progress','submitted') THEN RAISE EXCEPTION 'The student must confirm submission of the approved packet on a valid date'; END IF;
  NEW.recorded_at:=now();approving:=true;
 END IF;
 IF approving OR (NEW.family_shared AND NOT OLD.family_shared) THEN
  IF NEW.id IS DISTINCT FROM a.latest_review_packet_id OR (approving AND a.stage IN ('withdrawn','under_review','decision_received')) THEN RAISE EXCEPTION 'Use the latest packet for an active application'; END IF;
  preview:=public.application_review_preview(NEW.firm_id,NEW.updated_by_user_id,a.id,general_ids);
  IF NEW.fingerprint IS DISTINCT FROM preview->>'fingerprint' THEN RAISE EXCEPTION 'This packet is outdated. Prepare a new packet and review it again'; END IF;
  IF approving AND jsonb_array_length(preview->'blockers')>0 THEN RAISE EXCEPTION 'Resolve the final review checks before approval'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_application_packet BEFORE INSERT OR UPDATE ON application_review_packets FOR EACH ROW EXECUTE FUNCTION public.guard_application_packet();

CREATE FUNCTION public.point_application_review_packet() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 UPDATE applications SET latest_review_packet_id=NEW.id,updated_by_user_id=NEW.updated_by_user_id,updated_at=now()
  WHERE firm_id=NEW.firm_id AND student_id=NEW.student_id AND id=NEW.application_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unable to update the application review'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER point_application_review_packet AFTER INSERT ON application_review_packets FOR EACH ROW EXECUTE FUNCTION public.point_application_review_packet();

CREATE FUNCTION public.sync_application_packet_submission() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 UPDATE applications SET stage='submitted',submitted_at=(NEW.submitted_on::timestamp AT TIME ZONE coalesce((SELECT timezone FROM firms WHERE id=NEW.firm_id),'America/New_York')),updated_by_user_id=NEW.updated_by_user_id,updated_at=now()
  WHERE firm_id=NEW.firm_id AND student_id=NEW.student_id AND id=NEW.application_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unable to record the application submission'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sync_application_packet_submission AFTER UPDATE OF submitted_on ON application_review_packets FOR EACH ROW
 WHEN (NEW.submitted_on IS NOT NULL AND OLD.submitted_on IS NULL) EXECUTE FUNCTION public.sync_application_packet_submission();

-- Explicit commands preserve stale-editor detection and set identities server-side.
CREATE FUNCTION public.update_application_packet(p_firm uuid,p_actor uuid,p_packet uuid,p_revision integer,p_action text,
 p_submitted_on date DEFAULT NULL,p_platform text DEFAULT NULL,p_confirmation text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE p application_review_packets; app_id uuid;
BEGIN
 SELECT application_id INTO app_id FROM application_review_packets WHERE firm_id=p_firm AND id=p_packet;
 IF app_id IS NULL THEN RAISE EXCEPTION 'Packet not found'; END IF;
 -- Same lock order as preparation, then packet update, then its essay sources.
 PERFORM id FROM applications WHERE firm_id=p_firm AND id=app_id FOR UPDATE;
 SELECT * INTO p FROM application_review_packets WHERE firm_id=p_firm AND id=p_packet FOR UPDATE;
 IF p.id IS NULL OR p.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Packet changed in another window. Refresh before continuing'; END IF;
 PERFORM public.work_actor(p_firm,p_actor,p.student_id);
 IF p_action NOT IN ('approve_student','approve_counselor','withdraw_student','withdraw_counselor','share','unshare','submit') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid review action'; END IF;
 UPDATE application_review_packets SET revision=revision+1,updated_by_user_id=p_actor,
  student_approved_at=CASE WHEN p_action='approve_student' THEN clock_timestamp() WHEN p_action='withdraw_student' THEN NULL ELSE student_approved_at END,
  student_approved_by=CASE WHEN p_action='approve_student' THEN p_actor WHEN p_action='withdraw_student' THEN NULL ELSE student_approved_by END,
  counselor_approved_at=CASE WHEN p_action='approve_counselor' THEN clock_timestamp() WHEN p_action='withdraw_counselor' THEN NULL ELSE counselor_approved_at END,
  counselor_approved_by=CASE WHEN p_action='approve_counselor' THEN p_actor WHEN p_action='withdraw_counselor' THEN NULL ELSE counselor_approved_by END,
  family_shared=CASE WHEN p_action='share' THEN true WHEN p_action IN ('unshare','withdraw_student') THEN false ELSE family_shared END,
  submitted_on=CASE WHEN p_action='submit' THEN p_submitted_on ELSE submitted_on END,
  submission_platform=CASE WHEN p_action='submit' THEN p_platform ELSE submission_platform END,
  submission_confirmation=CASE WHEN p_action='submit' THEN nullif(btrim(p_confirmation),'') ELSE submission_confirmation END,
  recorded_at=CASE WHEN p_action='submit' THEN now() ELSE recorded_at END
 WHERE firm_id=p_firm AND id=p_packet;
 IF NOT FOUND THEN RAISE EXCEPTION 'Packet editing access required'; END IF;
 RETURN p_packet;
END $$;

REVOKE ALL ON FUNCTION public.application_packet_visible(uuid,uuid,jsonb,boolean),public.application_review_preview(uuid,uuid,uuid,uuid[]),public.guard_student_application_handoff(),public.guard_application_packet(),public.point_application_review_packet(),public.sync_application_packet_submission(),public.update_application_packet(uuid,uuid,uuid,integer,text,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.application_packet_visible(uuid,uuid,jsonb,boolean),public.application_review_preview(uuid,uuid,uuid,uuid[]),public.update_application_packet(uuid,uuid,uuid,integer,text,date,text,text) TO authenticated,service_role;
