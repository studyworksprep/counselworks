-- First-party, live Fall-2027 Common App evidence inspected November 13, 2026.
-- Shared content only: never rewrite/backfill existing student assignments.
UPDATE college_prompt_sets SET coverage='verified',verified_on='2026-11-13',review_due_on='2027-08-01',
 source_url='https://apply.commonapp.org/mycolleges/249/2757/20929',
 notes='Fall-2027 Common App verified November 13, 2026. The main Common App personal essay is required and is not duplicated here. SMU lists two optional college responses, each with a 250-word maximum. These require explicit counselor assignment. Hunt Leadership Scholarship essays/video and specialized-program or conduct-disclosure materials require separate individual review.'
WHERE firm_id IS NULL AND scorecard_id=228246 AND entry_year=2027;
INSERT INTO college_library_prompts(prompt_set_id,prompt_key,title,prompt_text,word_limit,requirement,text_kind,sort_order)
SELECT s.id,p.key,p.title,p.body,250,'optional','summary',p.ord
FROM college_prompt_sets s CROSS JOIN (VALUES
 ('why-smu','SMU — Why SMU','Explain your interest in SMU and the particular factors that led you to apply.',0),
 ('community','SMU — Contributing to the community','Describe how your experiences would enrich SMU and how you would benefit from its diverse learning community.',1)
) AS p(key,title,body,ord)
WHERE s.firm_id IS NULL AND s.scorecard_id=228246 AND s.entry_year=2027
ON CONFLICT(prompt_set_id,prompt_key) DO NOTHING;

UPDATE college_prompt_sets SET coverage='verified',verified_on='2026-11-13',review_due_on='2027-08-01',
 source_url='https://apply.commonapp.org/mycolleges/50/3364/10369',
 notes='Fall-2027 Common App and separate Writing Supplement verified November 13, 2026: three required short answers, each at most 300 words. The main Common App personal essay is separate. The Writing Supplement has its own review/submission step; completing the main application alone does not submit it. Fine Arts portfolios, auditions and specialized materials require individual review.'
WHERE firm_id IS NULL AND scorecard_id=211440 AND entry_year=2027;

UPDATE college_prompt_sets SET coverage='verified',verified_on='2026-11-13',review_due_on='2027-08-01',
 source_url='https://apply.commonapp.org/mycolleges/1057/5434/20534',
 notes='Fall-2027 Common App verified November 13, 2026. One general response is required (100–250 words). Three context responses appear only after the matching affirmative answer (maximum 250 each). Honors requires 150–400 words; Innovation Academy requires 150–300. Program/context responses require explicit counselor review and assignment. The main Common App personal essay is separate. Conduct, residency and other specialized disclosures remain individual checks. Honors writing must be completed before submitting the UF application.'
WHERE firm_id IS NULL AND scorecard_id=134130 AND entry_year=2027;
INSERT INTO college_library_prompts(prompt_set_id,prompt_key,title,prompt_text,word_limit,requirement,text_kind,sort_order)
SELECT s.id,p.key,p.title,p.body,p.words,p.requirement,'summary',p.ord
FROM college_prompt_sets s CROSS JOIN (VALUES
 ('meaningful-commitment','University of Florida — Meaningful commitment','Describe your most meaningful high-school commitment outside class and explain why it mattered. It may involve activities, work, service, academics, family responsibilities or another commitment. Write 100–250 words.',250,'required',0),
 ('employment-family','University of Florida — Employment or family obligations','Only if employment or family obligations limit extracurricular participation: describe those obligations. Maximum 250 words.',250,'conditional',1),
 ('college-preparation','University of Florida — College-preparation program','Only if an outside program assisted with college preparation or the college search: name the program, describe the involvement and benefits, and state how long the experience lasted. Maximum 250 words.',250,'conditional',2),
 ('additional-context','University of Florida — Additional context','Only if you choose to provide additional information or extenuating circumstances for admissions review: explain the relevant context. The instructions ask for fewer than 250 words; the editor accepts at most 250.',250,'conditional',3),
 ('honors','University of Florida — Honors mission','For Honors applicants only: explain how you would contribute to the program mission of supporting scholars who change the world, drawing on your influences, experiences, resources, aspirations and future plans. Write 150–400 words. Complete this within the UF application before submission.',400,'conditional',4),
 ('innovation-academy','University of Florida — Innovation Academy','For Innovation Academy applicants only: explain why you want to join the program and how it would influence your professional path. Write 150–300 words. Review the program calendar, eligible majors and enrollment conditions with your counselor.',300,'conditional',5)
) AS p(key,title,body,words,requirement,ord)
WHERE s.firm_id IS NULL AND s.scorecard_id=134130 AND s.entry_year=2027
ON CONFLICT(prompt_set_id,prompt_key) DO NOTHING;

UPDATE college_prompt_sets SET review_due_on='2026-11-13',source_url='https://apply.commonapp.org/mycolleges/1010/about',
 notes='Fall-2027 Common App general admission inspected; its main personal essay is required and is not duplicated here. No universal extra essay appeared in the inspected general application sections. Honors/Top Scholars requires two separate essays in the USC Admissions Portal after the general application is submitted. That current Honors form is unavailable, so its wording/limits remain unverified and this set stays under review. Do not submit an application solely to unlock prompts. Program-specific/disclosure routes require individual checks.'
WHERE firm_id IS NULL AND scorecard_id=218663 AND entry_year=2027 AND coverage='needs_review';

UPDATE college_prompt_sets SET coverage='verified',verified_on='2026-11-13',review_due_on='2027-08-01',
 source_url='https://apply.commonapp.org/mycolleges/299/3067/14882',
 notes='Fall-2027 Common App verified November 13, 2026. Up to two optional short answers may be submitted, each with a 300-word maximum. Choose distinct topics from the six listed choices. The two library entries represent response slots, not six separate assignments. The main Common App personal essay is required and is separate. Specialized-program or scholarship materials require individual review.'
WHERE firm_id IS NULL AND scorecard_id=231624 AND entry_year=2027;
INSERT INTO college_library_prompts(prompt_set_id,prompt_key,title,prompt_text,word_limit,requirement,text_kind,sort_order)
SELECT s.id,p.key,p.title,
 'Choose one unused topic: community and belonging; academic interest or career goal; family, culture or background; interest in W&M; a challenge and its impact; or what you would show a visitor to your town. Maximum 300 words.',300,'optional','summary',p.ord
FROM college_prompt_sets s CROSS JOIN (VALUES
 ('optional-response-1','William & Mary — Optional response 1',0),
 ('optional-response-2','William & Mary — Optional response 2',1)
) AS p(key,title,ord)
WHERE s.firm_id IS NULL AND s.scorecard_id=231624 AND s.entry_year=2027
ON CONFLICT(prompt_set_id,prompt_key) DO NOTHING;
