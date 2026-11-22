-- Global admissions material only. The worker discovers demand without exposing student/application rows.
CREATE TABLE supplement_source_checks (
  scorecard_id integer NOT NULL,
  entry_year integer NOT NULL,
  checked_at timestamptz NOT NULL,
  source_text text NOT NULL,
  issue text NOT NULL,
  PRIMARY KEY (scorecard_id, entry_year)
);
ALTER TABLE supplement_source_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON supplement_source_checks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON supplement_source_checks TO authenticated;
CREATE POLICY supplement_check_staff_read ON supplement_source_checks FOR SELECT TO authenticated USING (public.is_staff());
GRANT ALL ON supplement_source_checks TO service_role;

CREATE VIEW due_supplement_sources WITH (security_invoker=true) AS
SELECT DISTINCT c.scorecard_id, s.graduation_year AS entry_year
FROM applications a
JOIN colleges c ON c.id=a.college_id
JOIN students s ON s.id=a.student_id AND s.firm_id=a.firm_id
LEFT JOIN supplement_source_checks r ON r.scorecard_id=c.scorecard_id AND r.entry_year=s.graduation_year
WHERE a.submitted_at IS NULL AND s.graduation_year >= extract(year FROM current_date)
  AND (r.checked_at IS NULL OR r.checked_at < now() - CASE WHEN r.issue='' THEN interval '7 days' ELSE interval '1 day' END);
REVOKE ALL ON due_supplement_sources FROM PUBLIC, anon, authenticated;
GRANT SELECT ON due_supplement_sources TO service_role;

ALTER TABLE supplement_source_checks ADD COLUMN changed_at timestamptz NOT NULL DEFAULT now();
CREATE FUNCTION public.track_supplement_source_change() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  NEW.changed_at := CASE WHEN (NEW.source_text,NEW.issue) IS DISTINCT FROM (OLD.source_text,OLD.issue)
    THEN NEW.checked_at ELSE OLD.changed_at END;
  RETURN NEW;
END $$;
CREATE TRIGGER track_supplement_source_change BEFORE UPDATE ON supplement_source_checks
FOR EACH ROW EXECUTE FUNCTION public.track_supplement_source_change();
