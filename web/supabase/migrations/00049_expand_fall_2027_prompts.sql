-- Expand the requested fall-2027 collection to 21 colleges.
-- Source-linked summaries only. Keep unresolved sets out of automatic assignments.
-- Stable keys preserve references; existing student drafts and versions are untouched.
BEGIN;

INSERT INTO college_prompt_sets (scorecard_id, college_name, entry_year, coverage, source_url, verified_on, notes) VALUES (186131, 'Princeton University', 2027, 'verified', 'https://admission.princeton.edu/apply/princeton-specific-questions', '2026-10-26', 'Published 2026–27 questions. Six response slots; choose the academic variant matching A.B./undecided or B.S.E. A graded written paper is also required and is not represented as a new essay assignment.')
ON CONFLICT (scorecard_id, entry_year) DO UPDATE SET college_name=EXCLUDED.college_name, coverage=EXCLUDED.coverage, source_url=EXCLUDED.source_url, verified_on=EXCLUDED.verified_on, notes=EXCLUDED.notes;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'academic', 'Princeton University — Academic interests', 'A.B./undecided: connect your academic interests to Princeton opportunities. B.S.E.: explain your engineering motivation, relevant experiences and fit with Princeton.', 250, NULL, 'required', 'summary', 0 FROM college_prompt_sets WHERE scorecard_id=186131 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'community', 'Princeton University — Lived experience and dialogue', 'Explain how your lived experience shapes conversations, lessons you can share and your place in the campus community. Write 400–500 words.', 500, NULL, 'required', 'summary', 1 FROM college_prompt_sets WHERE scorecard_id=186131 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'service', 'Princeton University — Service and civic engagement', 'Connect your own story to service and civic responsibility.', 250, NULL, 'required', 'summary', 2 FROM college_prompt_sets WHERE scorecard_id=186131 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'skill', 'Princeton University — A new skill', 'Identify a skill you would like to learn during college.', 50, NULL, 'required', 'summary', 3 FROM college_prompt_sets WHERE scorecard_id=186131 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'joy', 'Princeton University — What brings you joy', 'Describe something that brings you happiness.', 50, NULL, 'required', 'summary', 4 FROM college_prompt_sets WHERE scorecard_id=186131 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'song', 'Princeton University — Your current soundtrack', 'Name the song that best fits your life at this moment.', 50, NULL, 'required', 'summary', 5 FROM college_prompt_sets WHERE scorecard_id=186131 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_prompt_sets (scorecard_id, college_name, entry_year, coverage, source_url, verified_on, notes) VALUES (190150, 'Columbia University', 2027, 'verified', 'https://undergrad.admissions.columbia.edu/apply/process/columbia-questions', '2026-10-26', '2026–27 questions, updated July 28, 2026. Six numbered responses: one list and five short answers. Follow the numbered questions on the official page.')
ON CONFLICT (scorecard_id, entry_year) DO UPDATE SET college_name=EXCLUDED.college_name, coverage=EXCLUDED.coverage, source_url=EXCLUDED.source_url, verified_on=EXCLUDED.verified_on, notes=EXCLUDED.notes;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'resources', 'Columbia University — Intellectual influences', 'List books, media, resources or experiences that have influenced your intellectual life outside schoolwork. Separate items with commas or semicolons; omit authors and explanations.', 100, NULL, 'required', 'summary', 0 FROM college_prompt_sets WHERE scorecard_id=190150 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'experience', 'Columbia University — Lived experience', 'Describe a meaningful experience and how it shapes your learning and contribution to Columbia’s collaborative community.', 150, NULL, 'required', 'summary', 1 FROM college_prompt_sets WHERE scorecard_id=190150 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'disagreement', 'Columbia University — Different perspectives', 'Discuss a disagreement, how you engaged with the other person and what you took away.', 150, NULL, 'required', 'summary', 2 FROM college_prompt_sets WHERE scorecard_id=190150 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'adversity', 'Columbia University — Responding to adversity', 'Describe a challenge you navigated and how you changed as a result.', 150, NULL, 'required', 'summary', 3 FROM college_prompt_sets WHERE scorecard_id=190150 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'why', 'Columbia University — Why Columbia', 'Explain the distinctive aspects of Columbia that attract you.', 150, NULL, 'required', 'summary', 4 FROM college_prompt_sets WHERE scorecard_id=190150 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'study', 'Columbia University — Areas of study', 'Explain what interests you about your chosen areas at Columbia College or Columbia Engineering.', 150, NULL, 'required', 'summary', 5 FROM college_prompt_sets WHERE scorecard_id=190150 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_prompt_sets (scorecard_id, college_name, entry_year, coverage, source_url, verified_on, notes) VALUES (199847, 'Wake Forest University', 2027, 'verified', 'https://admissions.wfu.edu/2026/07/wake-forest-applications-open-august-1-heres-whats-new/', '2026-10-26', 'Official July 22, 2026 announcement for 2026–27. Common App and Coalition use the same questions. Why Wake is required; choose at most one optional supplement.')
ON CONFLICT (scorecard_id, entry_year) DO UPDATE SET college_name=EXCLUDED.college_name, coverage=EXCLUDED.coverage, source_url=EXCLUDED.source_url, verified_on=EXCLUDED.verified_on, notes=EXCLUDED.notes;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'why', 'Wake Forest University — Why Wake Forest', 'Explain why you want to attend Wake Forest.', 100, NULL, 'required', 'summary', 0 FROM college_prompt_sets WHERE scorecard_id=199847 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'choice', 'Wake Forest University — Optional response', 'Choose one: five intriguing books (150 characters per title); intellectual curiosity about the world’s complexity (150 words); a Maya Angelou quotation connected to your life and contribution (300 words); or a themed top-ten list (100 characters per line).', NULL, NULL, 'optional', 'summary', 1 FROM college_prompt_sets WHERE scorecard_id=199847 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_prompt_sets (scorecard_id, college_name, entry_year, coverage, source_url, verified_on, notes) VALUES (228246, 'Southern Methodist University', 2027, 'needs_review', 'https://www.smu.edu/admission/apply/undergraduate-admission/requirements-guidelines', NULL, 'Checked October 26, 2026. The public requirements page describes application-platform essays but does not establish current supplemental wording or absence. Verify the 2026–27 application before assigning.')
ON CONFLICT (scorecard_id, entry_year) DO UPDATE SET college_name=EXCLUDED.college_name, coverage=EXCLUDED.coverage, source_url=EXCLUDED.source_url, verified_on=EXCLUDED.verified_on, notes=EXCLUDED.notes;

INSERT INTO college_prompt_sets (scorecard_id, college_name, entry_year, coverage, source_url, verified_on, notes) VALUES (211440, 'Carnegie Mellon University', 2027, 'needs_review', 'https://www.cmu.edu/admission/admission/admission-consideration', NULL, 'Checked October 26, 2026. The page publishes three 300-word questions but still labels its testing policy fall 2026. These are preliminary summaries; confirm the fall-2027 application before assignment. Fine Arts may require additional materials.')
ON CONFLICT (scorecard_id, entry_year) DO UPDATE SET college_name=EXCLUDED.college_name, coverage=EXCLUDED.coverage, source_url=EXCLUDED.source_url, verified_on=EXCLUDED.verified_on, notes=EXCLUDED.notes;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'major', 'Carnegie Mellon University — Inspiration for your field', 'Explain the developing passion or inspiration behind your intended area of study.', 300, NULL, 'required', 'summary', 0 FROM college_prompt_sets WHERE scorecard_id=211440 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'learning', 'Carnegie Mellon University — A successful college experience', 'Describe what successful learning during college would mean to you and your goals.', 300, NULL, 'required', 'summary', 1 FROM college_prompt_sets WHERE scorecard_id=211440 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'additional', 'Carnegie Mellon University — What else matters', 'Highlight something important or unaddressed in your application. Explain it in writing rather than linking to websites.', 300, NULL, 'required', 'summary', 2 FROM college_prompt_sets WHERE scorecard_id=211440 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_prompt_sets (scorecard_id, college_name, entry_year, coverage, source_url, verified_on, notes) VALUES (135726, 'University of Miami', 2027, 'no_supplement', 'https://admissions.miami.edu/undergraduate/application-process/admission-requirements/freshman/index.html', '2026-10-26', 'The personal-statement section explicitly says no supplemental essay is required. The Common App personal statement remains required. This covers general first-year admission; specialized programs may require portfolios or other materials.')
ON CONFLICT (scorecard_id, entry_year) DO UPDATE SET college_name=EXCLUDED.college_name, coverage=EXCLUDED.coverage, source_url=EXCLUDED.source_url, verified_on=EXCLUDED.verified_on, notes=EXCLUDED.notes;

INSERT INTO college_prompt_sets (scorecard_id, college_name, entry_year, coverage, source_url, verified_on, notes) VALUES (151351, 'Indiana University Bloomington', 2027, 'verified', 'https://bloomington.iu.edu/admissions/apply/application-faqs.html', '2026-10-26', 'Common App applicants submit a Common App essay; Apply IU applicants submit the IU-specific essay instead. Do not assign both. This covers the general application; individual programs may request more materials.')
ON CONFLICT (scorecard_id, entry_year) DO UPDATE SET college_name=EXCLUDED.college_name, coverage=EXCLUDED.coverage, source_url=EXCLUDED.source_url, verified_on=EXCLUDED.verified_on, notes=EXCLUDED.notes;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'apply-iu', 'Indiana University Bloomington — Apply IU essay', 'Apply IU applicants only: discuss academic and career goals and interests you hope to pursue at IU. You may also explain educational obstacles and how you addressed them. Write 200–400 words.', 400, NULL, 'conditional', 'summary', 0 FROM college_prompt_sets WHERE scorecard_id=151351 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_prompt_sets (scorecard_id, college_name, entry_year, coverage, source_url, verified_on, notes) VALUES (164924, 'Boston College', 2027, 'verified', 'https://www.bc.edu/content/bc-web/admission/apply', '2026-10-26', '2026–27 Common App supplement. Non-engineering applicants choose one of four topics; Human-Centered Engineering uses a different question. QuestBridge applicants only submit the engineering response if applicable (see BC’s QuestBridge instructions). Confirm route and program; no blanket assignment.')
ON CONFLICT (scorecard_id, entry_year) DO UPDATE SET college_name=EXCLUDED.college_name, coverage=EXCLUDED.coverage, source_url=EXCLUDED.source_url, verified_on=EXCLUDED.verified_on, notes=EXCLUDED.notes;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'choice', 'Boston College — Common App response choice', 'Common App applicants outside Human-Centered Engineering: choose a community tradition; an important conversation partner and shared questions; overcoming a reductive assumption; or an additional guiding value alongside attention, reflection and love.', 400, NULL, 'conditional', 'summary', 0 FROM college_prompt_sets WHERE scorecard_id=164924 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'engineering', 'Boston College — Human-Centered Engineering', 'Human-Centered Engineering applicants: discuss a societal problem you hope an engineering education will help you address.', 400, NULL, 'conditional', 'summary', 1 FROM college_prompt_sets WHERE scorecard_id=164924 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_prompt_sets (scorecard_id, college_name, entry_year, coverage, source_url, verified_on, notes) VALUES (152080, 'University of Notre Dame', 2027, 'verified', 'https://admissions.nd.edu/apply/how-to-apply/', '2026-10-26', 'Published Common App/Coalition supplement: one 150-word response and two different selected 50–100-word responses. QuestBridge follows a separate process. Confirm application route before assignment.')
ON CONFLICT (scorecard_id, entry_year) DO UPDATE SET college_name=EXCLUDED.college_name, coverage=EXCLUDED.coverage, source_url=EXCLUDED.source_url, verified_on=EXCLUDED.verified_on, notes=EXCLUDED.notes;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'priorities', 'University of Notre Dame — College priorities', 'For Common App/Coalition applicants: describe the essential qualities you insist on when choosing a college.', 150, NULL, 'conditional', 'summary', 0 FROM college_prompt_sets WHERE scorecard_id=152080 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'choice-1', 'University of Notre Dame — Selected response 1', 'For Common App/Coalition applicants: choose a topic about faith and decisions; a distinctive formative experience and your contribution; care and service to community; or a cause you would fight for. Write 50–100 words.', 100, NULL, 'conditional', 'summary', 1 FROM college_prompt_sets WHERE scorecard_id=152080 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'choice-2', 'University of Notre Dame — Selected response 2', 'Select a different topic from response 1. For Common App/Coalition applicants: choose a topic about faith and decisions; a distinctive formative experience and your contribution; care and service to community; or a cause you would fight for. Write 50–100 words.', 100, NULL, 'conditional', 'summary', 2 FROM college_prompt_sets WHERE scorecard_id=152080 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_prompt_sets (scorecard_id, college_name, entry_year, coverage, source_url, verified_on, notes) VALUES (234207, 'Washington and Lee University', 2027, 'verified', 'https://www.wlu.edu/admissions/apply/supplemental-application-prompts', '2026-10-26', 'General supplements are optional and submitted through the applicant portal. The selected response may instead be a video up to two minutes. Johnson Scholarship applicants have a separate conditional essay; consult https://www.wlu.edu/admissions/the-johnson-scholarship/johnson-scholarship-prompts for 2026–27 wording and QuestBridge instructions.')
ON CONFLICT (scorecard_id, entry_year) DO UPDATE SET college_name=EXCLUDED.college_name, coverage=EXCLUDED.coverage, source_url=EXCLUDED.source_url, verified_on=EXCLUDED.verified_on, notes=EXCLUDED.notes;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'why', 'Washington and Lee University — Why Washington and Lee', 'Explain how you learned about W&L and which aspects of its community appeal to you.', 250, NULL, 'optional', 'summary', 0 FROM college_prompt_sets WHERE scorecard_id=234207 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'choice', 'Washington and Lee University — Optional response choice', 'Choose one: an outside-school commitment and its effects on you and others; a perspective you would contribute; an intellectual fascination; or the significance of a name you use. You may submit a video up to two minutes instead.', 250, NULL, 'optional', 'summary', 1 FROM college_prompt_sets WHERE scorecard_id=234207 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_library_prompts (prompt_set_id, prompt_key, title, prompt_text, word_limit, character_limit, requirement, text_kind, sort_order)
SELECT id, 'johnson', 'Washington and Lee University — Johnson Scholarship response', 'Johnson Scholarship applicants only: choose an influential artwork; an unexpected detour and lessons learned; an authentic representation of your development (words only); a proposed Spring Term course; or community norms you have questioned and how you would improve your community. Read the linked Johnson Scholarship page for exact wording.', 800, NULL, 'conditional', 'summary', 2 FROM college_prompt_sets WHERE scorecard_id=234207 AND entry_year=2027
ON CONFLICT (prompt_set_id, prompt_key) DO UPDATE SET title=EXCLUDED.title, prompt_text=EXCLUDED.prompt_text, word_limit=EXCLUDED.word_limit, character_limit=EXCLUDED.character_limit, requirement=EXCLUDED.requirement, text_kind=EXCLUDED.text_kind, sort_order=EXCLUDED.sort_order;

INSERT INTO college_prompt_sets (scorecard_id, college_name, entry_year, coverage, source_url, verified_on, notes) VALUES (134130, 'University of Florida', 2027, 'needs_review', 'https://admissions.ufl.edu/apply/freshman/', NULL, 'Checked October 26, 2026. The official page confirms a UF Supplement with additional short answers and an Honors essay, but does not publish the complete wording or limits. Confirm these in the 2026–27 application; absence of drafts does not mean no supplement.')
ON CONFLICT (scorecard_id, entry_year) DO UPDATE SET college_name=EXCLUDED.college_name, coverage=EXCLUDED.coverage, source_url=EXCLUDED.source_url, verified_on=EXCLUDED.verified_on, notes=EXCLUDED.notes;

INSERT INTO college_prompt_sets (scorecard_id, college_name, entry_year, coverage, source_url, verified_on, notes) VALUES (234076, 'University of Virginia', 2027, 'needs_review', 'https://admission.virginia.edu/admission/deadlines-instructions', NULL, 'Checked October 26, 2026. Current public instructions do not establish a complete prompt set, including nursing-specific requirements. Confirm the 2026–27 application; do not reuse prior-cycle questions or infer no supplement from missing text.')
ON CONFLICT (scorecard_id, entry_year) DO UPDATE SET college_name=EXCLUDED.college_name, coverage=EXCLUDED.coverage, source_url=EXCLUDED.source_url, verified_on=EXCLUDED.verified_on, notes=EXCLUDED.notes;

INSERT INTO college_prompt_sets (scorecard_id, college_name, entry_year, coverage, source_url, verified_on, notes) VALUES (231624, 'College of William and Mary', 2027, 'needs_review', 'https://www.wm.edu/admission/undergraduateadmission/how-to-apply/first-year-applicants/application-checklist/', NULL, 'Checked October 26, 2026. The official checklist encourages up to two optional essays but does not publish their current wording or limits. Verify the 2026–27 Common App questions before assigning.')
ON CONFLICT (scorecard_id, entry_year) DO UPDATE SET college_name=EXCLUDED.college_name, coverage=EXCLUDED.coverage, source_url=EXCLUDED.source_url, verified_on=EXCLUDED.verified_on, notes=EXCLUDED.notes;

INSERT INTO college_prompt_sets (scorecard_id, college_name, entry_year, coverage, source_url, verified_on, notes) VALUES (218663, 'University of South Carolina', 2027, 'needs_review', 'https://sc.edu/about/offices_and_divisions/undergraduate_admissions/apply/for_freshmen/', NULL, 'Checked October 26, 2026. General admission requires an application essay. Current additional questions and Honors/scholarship wording need confirmation inside the application; do not duplicate the main personal essay.')
ON CONFLICT (scorecard_id, entry_year) DO UPDATE SET college_name=EXCLUDED.college_name, coverage=EXCLUDED.coverage, source_url=EXCLUDED.source_url, verified_on=EXCLUDED.verified_on, notes=EXCLUDED.notes;

COMMIT;
