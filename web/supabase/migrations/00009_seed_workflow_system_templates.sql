-- =============================================================================
-- Seed: built-in system workflow templates
-- =============================================================================
-- Adds two firm_id IS NULL, is_system_template = true templates so newly
-- created firms have a working starting point. The DO blocks are idempotent —
-- if a template with the same name already exists they are skipped.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Template: Senior Year Application Cycle
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    template_id uuid;
    s_finalize_list uuid;
    s_common_app_account uuid;
    s_request_recs uuid;
    s_transcript_request uuid;
    s_draft_common_essay uuid;
    s_essay_review uuid;
    s_draft_supplements uuid;
    s_fafsa uuid;
    s_css_profile uuid;
    s_submit_ea uuid;
    s_submit_rd uuid;
    s_aid_review uuid;
BEGIN
    SELECT id INTO template_id
    FROM workflow_templates
    WHERE is_system_template = true
      AND name = 'Senior Year Application Cycle'
    LIMIT 1;

    IF FOUND THEN
        RETURN;
    END IF;

    INSERT INTO workflow_templates (
        firm_id, name, description, category, workflow_type,
        is_system_template, is_active, is_default
    )
    VALUES (
        NULL,
        'Senior Year Application Cycle',
        'A standard plan covering the senior-year process from finalizing the college list through final aid review. Dates are computed relative to the start date you choose when applying it.',
        'senior',
        'application',
        true,
        true,
        false
    )
    RETURNING id INTO template_id;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Finalize college list',
        'Lock in the list of schools the student plans to apply to.',
        0, 'milestone', 'planning', 'counselor', 0,
        NULL, true, 'staff'
    ) RETURNING id INTO s_finalize_list;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Set up Common App account',
        'Create the account, enter profile data, and add schools.',
        1, 'task', 'admin', 'student', 7,
        NULL, true, 'student'
    ) RETURNING id INTO s_common_app_account;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Request teacher recommendations',
        'Ask 2-3 teachers and confirm they have what they need.',
        2, 'task', 'recommendations', 'student', 14,
        s_finalize_list, true, 'student'
    ) RETURNING id INTO s_request_recs;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Submit transcript requests',
        'Submit official transcript requests to the registrar.',
        3, 'task', 'admin', 'counselor', 21,
        s_finalize_list, true, 'staff'
    ) RETURNING id INTO s_transcript_request;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Draft Common App personal essay',
        'Produce a complete first draft of the Common App essay.',
        4, 'task', 'essay', 'student', 30,
        NULL, true, 'student'
    ) RETURNING id INTO s_draft_common_essay;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Review and revise Common App essay',
        'Essay coach reviews the draft and the student incorporates feedback.',
        5, 'review', 'essay_review', 'essay_coach', 45,
        s_draft_common_essay, true, 'student'
    ) RETURNING id INTO s_essay_review;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Draft school-specific supplements',
        'Write a first draft of every supplemental essay required.',
        6, 'task', 'essay', 'student', 60,
        s_draft_common_essay, true, 'student'
    ) RETURNING id INTO s_draft_supplements;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Submit FAFSA',
        'Complete and submit the Free Application for Federal Student Aid.',
        7, 'task', 'financial_aid', 'parent_guardian', 90,
        NULL, true, 'family'
    ) RETURNING id INTO s_fafsa;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Submit CSS Profile',
        'Submit the CSS Profile for any schools that require it.',
        8, 'task', 'financial_aid', 'parent_guardian', 100,
        NULL, false, 'family'
    ) RETURNING id INTO s_css_profile;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Submit early-action / early-decision applications',
        'Submit any EA/ED applications by their deadlines.',
        9, 'milestone', 'application_submit', 'student', 120,
        s_essay_review, false, 'student'
    ) RETURNING id INTO s_submit_ea;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Submit regular-decision applications',
        'Submit all remaining regular-decision applications.',
        10, 'milestone', 'application_submit', 'student', 180,
        s_submit_ea, true, 'student'
    ) RETURNING id INTO s_submit_rd;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Final aid and scholarship review',
        'Compare aid offers and finalize the enrollment decision.',
        11, 'review', 'financial_aid', 'counselor', 210,
        s_submit_rd, true, 'family'
    ) RETURNING id INTO s_aid_review;
END $$;

-- -----------------------------------------------------------------------------
-- Template: Junior Year Roadmap
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    template_id uuid;
    s_kickoff uuid;
    s_course_rigor uuid;
    s_fall_test_reg uuid;
    s_extracurricular_plan uuid;
    s_initial_list uuid;
    s_visits uuid;
    s_school_counselor uuid;
    s_spring_test uuid;
    s_recommenders uuid;
    s_senior_transition uuid;
BEGIN
    SELECT id INTO template_id
    FROM workflow_templates
    WHERE is_system_template = true
      AND name = 'Junior Year Roadmap'
    LIMIT 1;

    IF FOUND THEN
        RETURN;
    END IF;

    INSERT INTO workflow_templates (
        firm_id, name, description, category, workflow_type,
        is_system_template, is_active, is_default
    )
    VALUES (
        NULL,
        'Junior Year Roadmap',
        'A 9-month plan covering the junior year — testing, course planning, list building, and the transition into senior year.',
        'junior',
        'general',
        true,
        true,
        false
    )
    RETURNING id INTO template_id;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Initial planning meeting',
        'Kickoff meeting with the student to align goals and expectations.',
        0, 'milestone', 'meeting', 'counselor', 0,
        NULL, true, 'student'
    ) RETURNING id INTO s_kickoff;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Confirm senior-year course rigor',
        'Review the proposed senior schedule for academic rigor.',
        1, 'review', 'planning', 'counselor', 14,
        s_kickoff, true, 'staff'
    ) RETURNING id INTO s_course_rigor;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Register for fall SAT/ACT',
        'Pick a fall test date and register.',
        2, 'task', 'testing', 'student', 30,
        NULL, true, 'student'
    ) RETURNING id INTO s_fall_test_reg;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Plan extracurricular leadership',
        'Identify activities to deepen and leadership roles to pursue.',
        3, 'task', 'planning', 'student', 60,
        NULL, false, 'student'
    ) RETURNING id INTO s_extracurricular_plan;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Draft initial college list',
        'Build a working list of likely / target / reach schools.',
        4, 'milestone', 'planning', 'counselor', 90,
        s_kickoff, true, 'student'
    ) RETURNING id INTO s_initial_list;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Schedule campus visits',
        'Plan and schedule visits to colleges on the working list.',
        5, 'task', 'planning', 'student', 120,
        s_initial_list, false, 'family'
    ) RETURNING id INTO s_visits;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Meet with school counselor',
        'Confirm senior-year schedule and any AP / dual-enrollment plans.',
        6, 'task', 'meeting', 'student', 150,
        NULL, true, 'student'
    ) RETURNING id INTO s_school_counselor;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Take spring SAT/ACT',
        'Sit for the spring test (or retake from fall).',
        7, 'milestone', 'testing', 'student', 180,
        s_fall_test_reg, true, 'student'
    ) RETURNING id INTO s_spring_test;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Identify recommendation letter writers',
        'Choose 2-3 teachers to ask for recommendations next fall.',
        8, 'task', 'recommendations', 'student', 210,
        NULL, true, 'student'
    ) RETURNING id INTO s_recommenders;

    INSERT INTO workflow_template_steps (
        workflow_template_id, name, description, step_order, step_type,
        task_type, default_assignee_role, default_due_offset_days,
        depends_on_step_id, is_required, visibility_scope
    ) VALUES (
        template_id, 'Senior-year transition review',
        'End-of-year wrap up — confirm summer plans and senior cycle kickoff.',
        9, 'milestone', 'meeting', 'counselor', 270,
        NULL, true, 'student'
    ) RETURNING id INTO s_senior_transition;
END $$;
