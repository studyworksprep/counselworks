-- =============================================================================
-- Replace the two monolithic system workflow templates from migration 00009
-- with a set of smaller, composable templates that better match how
-- counselors actually run a process:
--   * Per-grade "anchor" templates carrying only the date-locked items
--     (transcripts, FAFSA, EA/RD submission, testing windows, etc.)
--   * Discretionary templates a counselor starts when the student is ready
--     (Personal Statement, Activities & Honors, Recommendation Letters)
--   * A per-college supplement template instantiated once per college as
--     the application list firms up.
-- =============================================================================

-- Remove the old monolithic templates. Their workflow_template_steps cascade
-- via the FK definition on workflow_template_steps.workflow_template_id.
DELETE FROM workflow_templates
WHERE is_system_template = true
  AND name IN ('Senior Year Application Cycle', 'Junior Year Roadmap');

-- -----------------------------------------------------------------------------
-- Freshman Year Anchors
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    template_id uuid;
    s_kickoff uuid;
    s_course uuid;
    s_midyear uuid;
    s_eoy uuid;
BEGIN
    SELECT id INTO template_id FROM workflow_templates
    WHERE is_system_template = true AND name = 'Freshman Year Anchors' LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    INSERT INTO workflow_templates (
        firm_id, name, description, category, workflow_type,
        grade_level, instantiation_scope,
        is_system_template, is_active, is_default
    ) VALUES (
        NULL, 'Freshman Year Anchors',
        'Foundation-year touchpoints: course planning, study habits, and an end-of-year reflection. Apply at the start of 9th grade.',
        'anchors', 'general', 'freshman', 'student',
        true, true, false
    ) RETURNING id INTO template_id;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Freshman year kickoff',
        'Welcome meeting to set goals and orient the student to the high school years.',
        0, 'milestone', 'meeting', 'counselor', 0,
        NULL, true, 'student'
    ) RETURNING id INTO s_kickoff;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Course planning + study habits review',
        'Review the academic schedule and establish study routines.',
        1, 'task', 'planning', 'counselor', 30,
        s_kickoff, true, 'student'
    ) RETURNING id INTO s_course;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Mid-year academic check-in',
        'Review grades, course load, and any adjustments needed for the spring semester.',
        2, 'task', 'meeting', 'counselor', 120,
        NULL, true, 'student'
    ) RETURNING id INTO s_midyear;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'End-of-year reflection',
        'Reflect on freshman year and outline summer reading / enrichment plans.',
        3, 'milestone', 'meeting', 'counselor', 270,
        NULL, true, 'student'
    ) RETURNING id INTO s_eoy;
END $$;

-- -----------------------------------------------------------------------------
-- Sophomore Year Anchors
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    template_id uuid;
    s_kickoff uuid;
    s_psat uuid;
    s_midyear uuid;
    s_summer uuid;
BEGIN
    SELECT id INTO template_id FROM workflow_templates
    WHERE is_system_template = true AND name = 'Sophomore Year Anchors' LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    INSERT INTO workflow_templates (
        firm_id, name, description, category, workflow_type,
        grade_level, instantiation_scope,
        is_system_template, is_active, is_default
    ) VALUES (
        NULL, 'Sophomore Year Anchors',
        'Date-anchored sophomore-year touchpoints: PSAT, mid-year check-in, and summer planning.',
        'anchors', 'general', 'sophomore', 'student',
        true, true, false
    ) RETURNING id INTO template_id;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Sophomore year kickoff',
        'Set the year''s academic and extracurricular focus.',
        0, 'milestone', 'meeting', 'counselor', 0,
        NULL, true, 'student'
    ) RETURNING id INTO s_kickoff;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Take PSAT (practice)',
        'Sit for the sophomore PSAT to baseline standardized testing.',
        1, 'milestone', 'testing', 'student', 30,
        NULL, true, 'student'
    ) RETURNING id INTO s_psat;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Mid-year academic check-in',
        'Confirm rigor for spring semester and discuss junior-year course planning.',
        2, 'task', 'meeting', 'counselor', 120,
        NULL, true, 'student'
    ) RETURNING id INTO s_midyear;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Summer planning',
        'Identify a summer experience — program, internship, job, or research.',
        3, 'milestone', 'planning', 'counselor', 270,
        NULL, true, 'family'
    ) RETURNING id INTO s_summer;
END $$;

-- -----------------------------------------------------------------------------
-- Junior Year Anchors
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    template_id uuid;
    s_kickoff uuid;
    s_psat uuid;
    s_rigor uuid;
    s_spring_test uuid;
    s_transition uuid;
BEGIN
    SELECT id INTO template_id FROM workflow_templates
    WHERE is_system_template = true AND name = 'Junior Year Anchors' LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    INSERT INTO workflow_templates (
        firm_id, name, description, category, workflow_type,
        grade_level, instantiation_scope,
        is_system_template, is_active, is_default
    ) VALUES (
        NULL, 'Junior Year Anchors',
        'Date-anchored junior-year items: PSAT/NMSQT, course-rigor confirmation, spring testing, and the senior-year transition.',
        'anchors', 'general', 'junior', 'student',
        true, true, false
    ) RETURNING id INTO template_id;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Junior year kickoff',
        'Align on academic and extracurricular goals for the most important year.',
        0, 'milestone', 'meeting', 'counselor', 0,
        NULL, true, 'student'
    ) RETURNING id INTO s_kickoff;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Take PSAT/NMSQT',
        'October PSAT — qualifies for National Merit recognition.',
        1, 'milestone', 'testing', 'student', 30,
        NULL, true, 'student'
    ) RETURNING id INTO s_psat;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Confirm senior-year course rigor',
        'Review proposed senior schedule and recommend adjustments.',
        2, 'review', 'planning', 'counselor', 120,
        NULL, true, 'staff'
    ) RETURNING id INTO s_rigor;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Spring SAT/ACT',
        'Sit for the spring test (or first attempt if not earlier).',
        3, 'milestone', 'testing', 'student', 180,
        NULL, true, 'student'
    ) RETURNING id INTO s_spring_test;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Senior-year transition meeting',
        'End of junior year wrap-up and senior cycle kickoff.',
        4, 'milestone', 'meeting', 'counselor', 270,
        NULL, true, 'student'
    ) RETURNING id INTO s_transition;
END $$;

-- -----------------------------------------------------------------------------
-- Senior Year Anchors
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    template_id uuid;
    s_lock_list uuid;
    s_transcripts uuid;
    s_fafsa uuid;
    s_css uuid;
    s_ea uuid;
    s_rd uuid;
    s_aid uuid;
BEGIN
    SELECT id INTO template_id FROM workflow_templates
    WHERE is_system_template = true AND name = 'Senior Year Anchors' LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    INSERT INTO workflow_templates (
        firm_id, name, description, category, workflow_type,
        grade_level, instantiation_scope,
        is_system_template, is_active, is_default
    ) VALUES (
        NULL, 'Senior Year Anchors',
        'The date-locked items in the senior year: transcript requests, FAFSA / CSS, EA/ED and RD submission windows, and aid review. Pair with the Personal Statement, Activities & Honors, Recommendation Letters, and per-college Supplement workflows.',
        'anchors', 'application', 'senior', 'student',
        true, true, false
    ) RETURNING id INTO template_id;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Lock the college list',
        'Final pass on the college list before applications open.',
        0, 'milestone', 'planning', 'counselor', 0,
        NULL, true, 'student'
    ) RETURNING id INTO s_lock_list;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Submit transcript requests',
        'Submit official transcript requests to the registrar for every college.',
        1, 'task', 'admin', 'counselor', 21,
        s_lock_list, true, 'staff'
    ) RETURNING id INTO s_transcripts;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Submit FAFSA',
        'Complete and submit the FAFSA. Federal form; required for most aid.',
        2, 'task', 'financial_aid', 'parent_guardian', 90,
        NULL, true, 'family'
    ) RETURNING id INTO s_fafsa;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Submit CSS Profile',
        'Submit CSS Profile for any school that requires it.',
        3, 'task', 'financial_aid', 'parent_guardian', 100,
        NULL, false, 'family'
    ) RETURNING id INTO s_css;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Early-action / early-decision deadline window',
        'EA/ED applications submitted by their respective deadlines.',
        4, 'milestone', 'application_submit', 'student', 120,
        NULL, false, 'student'
    ) RETURNING id INTO s_ea;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Regular-decision deadline window',
        'All remaining regular-decision applications submitted.',
        5, 'milestone', 'application_submit', 'student', 180,
        NULL, true, 'student'
    ) RETURNING id INTO s_rd;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Final aid + scholarship review',
        'Compare aid offers across acceptances and finalize enrollment.',
        6, 'review', 'financial_aid', 'counselor', 210,
        s_rd, true, 'family'
    ) RETURNING id INTO s_aid;
END $$;

-- -----------------------------------------------------------------------------
-- Personal Statement (discretionary, runs in parallel)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    template_id uuid;
    s_brainstorm uuid;
    s_outline uuid;
    s_draft1 uuid;
    s_review1 uuid;
    s_draft2 uuid;
    s_review2 uuid;
    s_polish uuid;
    s_lock uuid;
BEGIN
    SELECT id INTO template_id FROM workflow_templates
    WHERE is_system_template = true AND name = 'Personal Statement' LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    INSERT INTO workflow_templates (
        firm_id, name, description, category, workflow_type,
        grade_level, instantiation_scope,
        is_system_template, is_active, is_default
    ) VALUES (
        NULL, 'Personal Statement',
        'A multi-month plan covering brainstorming through final polish of the Common App personal statement. Counselors typically start this in March of junior year for a finalized essay by August, but can be applied at any time.',
        'essay', 'essay', 'any', 'student',
        true, true, false
    ) RETURNING id INTO template_id;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Brainstorm topics',
        'Free-write candidate topics, anecdotes, and themes.',
        0, 'task', 'essay', 'student', 0,
        NULL, true, 'student'
    ) RETURNING id INTO s_brainstorm;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Outline + topic selection meeting',
        'Pick a topic with the essay coach and outline structure.',
        1, 'review', 'essay', 'essay_coach', 14,
        s_brainstorm, true, 'student'
    ) RETURNING id INTO s_outline;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'First full draft',
        'Complete first draft, ~650 words.',
        2, 'task', 'essay', 'student', 30,
        s_outline, true, 'student'
    ) RETURNING id INTO s_draft1;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Coach review (round 1)',
        'Detailed feedback on structure, voice, and content.',
        3, 'review', 'essay_review', 'essay_coach', 45,
        s_draft1, true, 'student'
    ) RETURNING id INTO s_review1;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Second draft incorporating feedback',
        'Revise based on coach feedback.',
        4, 'task', 'essay', 'student', 60,
        s_review1, true, 'student'
    ) RETURNING id INTO s_draft2;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Coach review (round 2)',
        'Second pass — refine voice and tighten language.',
        5, 'review', 'essay_review', 'essay_coach', 90,
        s_draft2, true, 'student'
    ) RETURNING id INTO s_review2;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Polish + final review',
        'Line edits, proofreading, final word-count check.',
        6, 'review', 'essay_review', 'essay_coach', 120,
        s_review2, true, 'student'
    ) RETURNING id INTO s_polish;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Lock final personal statement',
        'Mark the personal statement as ready to use across applications.',
        7, 'milestone', 'essay', 'student', 150,
        s_polish, true, 'student'
    ) RETURNING id INTO s_lock;
END $$;

-- -----------------------------------------------------------------------------
-- Activities & Honors List (discretionary)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    template_id uuid;
    s_brainstorm uuid;
    s_draft uuid;
    s_review uuid;
    s_revise uuid;
    s_honors uuid;
    s_lock uuid;
BEGIN
    SELECT id INTO template_id FROM workflow_templates
    WHERE is_system_template = true AND name = 'Activities & Honors List' LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    INSERT INTO workflow_templates (
        firm_id, name, description, category, workflow_type,
        grade_level, instantiation_scope,
        is_system_template, is_active, is_default
    ) VALUES (
        NULL, 'Activities & Honors List',
        'Build the Common App activities and honors lists. Best run in late junior year through early senior year.',
        'essay', 'application', 'any', 'student',
        true, true, false
    ) RETURNING id INTO template_id;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Brainstorm activities + roles',
        'Free-list every activity, role, and time commitment from grades 9-12.',
        0, 'task', 'planning', 'student', 0,
        NULL, true, 'student'
    ) RETURNING id INTO s_brainstorm;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'First draft of activities list',
        'Draft the 10-slot Common App activities list with descriptions.',
        1, 'task', 'application', 'student', 14,
        s_brainstorm, true, 'student'
    ) RETURNING id INTO s_draft;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Counselor review',
        'Review prioritization, descriptions, and impact statements.',
        2, 'review', 'application', 'counselor', 30,
        s_draft, true, 'student'
    ) RETURNING id INTO s_review;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Revised draft with stronger descriptions',
        'Incorporate feedback; strengthen verbs and quantify impact.',
        3, 'task', 'application', 'student', 45,
        s_review, true, 'student'
    ) RETURNING id INTO s_revise;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Honors list draft',
        'Compile the honors / awards list with 5-slot Common App format.',
        4, 'task', 'application', 'student', 60,
        NULL, true, 'student'
    ) RETURNING id INTO s_honors;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Lock activities + honors for Common App',
        'Final approval before submission.',
        5, 'milestone', 'application', 'counselor', 90,
        s_revise, true, 'student'
    ) RETURNING id INTO s_lock;
END $$;

-- -----------------------------------------------------------------------------
-- Recommendation Letters (discretionary)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    template_id uuid;
    s_identify uuid;
    s_ask uuid;
    s_brag uuid;
    s_confirm uuid;
    s_followup uuid;
    s_thank uuid;
BEGIN
    SELECT id INTO template_id FROM workflow_templates
    WHERE is_system_template = true AND name = 'Recommendation Letters' LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    INSERT INTO workflow_templates (
        firm_id, name, description, category, workflow_type,
        grade_level, instantiation_scope,
        is_system_template, is_active, is_default
    ) VALUES (
        NULL, 'Recommendation Letters',
        'End-to-end management of teacher and counselor recommendations: identification, formal asks, brag sheets, follow-ups, and thank-you notes.',
        'recommendations', 'application', 'any', 'student',
        true, true, false
    ) RETURNING id INTO template_id;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Identify recommenders',
        'Choose 2-3 teachers and a counselor recommender.',
        0, 'task', 'recommendations', 'student', 0,
        NULL, true, 'student'
    ) RETURNING id INTO s_identify;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Make formal asks',
        'In-person or written request to each recommender.',
        1, 'task', 'recommendations', 'student', 7,
        s_identify, true, 'student'
    ) RETURNING id INTO s_ask;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Provide brag sheets / resumes',
        'Share a one-page summary, resume, and any context recommenders need.',
        2, 'task', 'recommendations', 'student', 14,
        s_ask, true, 'student'
    ) RETURNING id INTO s_brag;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Confirm acceptance + Common App invites',
        'Confirm each recommender accepted and was invited via Common App.',
        3, 'task', 'recommendations', 'counselor', 30,
        s_ask, true, 'student'
    ) RETURNING id INTO s_confirm;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Follow-up reminders',
        'Polite reminders 2 weeks before each application deadline.',
        4, 'task', 'recommendations', 'counselor', 60,
        NULL, false, 'staff'
    ) RETURNING id INTO s_followup;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Thank-you notes',
        'Hand-written thank-yous after letters are submitted.',
        5, 'milestone', 'recommendations', 'student', 90,
        s_confirm, true, 'student'
    ) RETURNING id INTO s_thank;
END $$;

-- -----------------------------------------------------------------------------
-- Supplement Essays for College (per-college, applied once per school)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    template_id uuid;
    s_prompts uuid;
    s_outline uuid;
    s_draft uuid;
    s_review uuid;
    s_revise uuid;
    s_final uuid;
    s_submit uuid;
BEGIN
    SELECT id INTO template_id FROM workflow_templates
    WHERE is_system_template = true AND name = 'Supplement Essays for College' LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    INSERT INTO workflow_templates (
        firm_id, name, description, category, workflow_type,
        grade_level, instantiation_scope,
        is_system_template, is_active, is_default
    ) VALUES (
        NULL, 'Supplement Essays for College',
        'A 6-week per-college supplement workflow. Apply once per college from the student''s college list — the workflow is named for that school and times to its deadline.',
        'supplements', 'essay', 'any', 'student_college',
        true, true, false
    ) RETURNING id INTO template_id;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Pull and analyze prompts',
        'Read every prompt for this school; note word limits and angles.',
        0, 'task', 'essay', 'student', 0,
        NULL, true, 'student'
    ) RETURNING id INTO s_prompts;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Outline responses',
        'Outline each supplement: thesis, structure, key beats.',
        1, 'task', 'essay', 'student', 7,
        s_prompts, true, 'student'
    ) RETURNING id INTO s_outline;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'First drafts',
        'Complete first drafts of all supplements.',
        2, 'task', 'essay', 'student', 14,
        s_outline, true, 'student'
    ) RETURNING id INTO s_draft;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Coach review',
        'Essay coach reviews supplements and gives feedback.',
        3, 'review', 'essay_review', 'essay_coach', 21,
        s_draft, true, 'student'
    ) RETURNING id INTO s_review;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Revised drafts',
        'Incorporate feedback into revised supplements.',
        4, 'task', 'essay', 'student', 28,
        s_review, true, 'student'
    ) RETURNING id INTO s_revise;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Final review + polish',
        'Final pass: line edits, formatting, word-count check.',
        5, 'review', 'essay_review', 'essay_coach', 35,
        s_revise, true, 'student'
    ) RETURNING id INTO s_final;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Submit application',
        'Submit the application to this school.',
        6, 'milestone', 'application_submit', 'student', 45,
        s_final, true, 'student'
    ) RETURNING id INTO s_submit;
END $$;
