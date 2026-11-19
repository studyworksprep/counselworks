"""One reviewed feedback record per suggestion; all three AI modes share quota."""
import concurrent.futures
import json
import os
import subprocess
import uuid
from urllib.parse import urlparse

url = os.environ['DATABASE_URL']
target = urlparse(url)
assert target.hostname in ('localhost', '127.0.0.1') and target.path.endswith('_test')
firm = 'a0000000-0000-4000-8000-000000000001'
student = 'a0000000-0000-4000-8000-000000000041'
actor = 'a0000000-0000-4000-8000-000000000012'
recipient = 'a0000000-0000-4000-8000-000000000015'
essay, version, bank = (str(uuid.uuid4()) for _ in range(3))
auth = "BEGIN; SET LOCAL request.jwt.claims='{\"sub\":\"test_clerk_alpha_counselor\"}'; SET LOCAL ROLE authenticated;"
interview_ids = []

def sql(query):
    r = subprocess.run(['psql', url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], input=query, text=True, capture_output=True)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return r.stdout.strip()

refs = f"(SELECT jsonb_agg(jsonb_build_object('kind',s->'kind','id',s->'id','revision',s->'revision','stamp',s->'stamp')) FROM jsonb_array_elements(public.essay_ai_sources('{firm}','{actor}','{student}',false)) s WHERE s->>'id'='{bank}')"
coach = f"INSERT INTO essay_coach_requests(firm_id,student_id,essay_id,version_id,owner_user_id,source_refs,task_stamp) VALUES('{firm}','{student}','{essay}','{version}','{actor}',{refs},public.essay_coach_stamp('{firm}','{actor}','{essay}','{version}')) RETURNING id;"
planning = f"INSERT INTO essay_ai_requests(firm_id,student_id,essay_id,owner_user_id,mode,source_refs,task_stamp) VALUES('{firm}','{student}','{essay}','{actor}','story_matches',{refs},public.essay_ai_task_stamp('{firm}','{actor}','{essay}')) RETURNING id;"
interview = f"INSERT INTO student_ai_requests(firm_id,student_id,owner_user_id,recipient_user_id,mode,source_refs) VALUES('{firm}','{student}','{actor}','{recipient}','questions','[]') RETURNING id;"

try:
    sql(f"INSERT INTO essay_drafts(id,firm_id,student_id,essay_type,title,prompt_text,body,visibility_scope,created_by_user_id,updated_by_user_id) VALUES('{essay}','{firm}','{student}','supplemental','Concurrent saved coaching','Describe a choice.','Preserved working writing','student','{actor}','{actor}'); INSERT INTO essay_draft_versions(id,essay_draft_id,version_number,body,created_by_user_id) VALUES('{version}','{essay}',1,'One exact saved passage.','{recipient}'); INSERT INTO student_story_bank(id,firm_id,student_id,kind,title,body,audience,review_state,created_by_user_id) VALUES('{bank}','{firm}','{student}','story','A choice','A real scene','counselor','confirmed','{actor}');")
    request = sql(auth + coach + 'COMMIT;')
    result = json.dumps({'assessment': 'Explore the choice.', 'suggestions': [{'category': 'specificity', 'quote': 'One exact saved passage.', 'observation': 'A choice is visible.', 'question': 'What changed?', 'sourceKeys': [f'bank:{bank}']}], 'gaps': []})
    sql(auth + f"UPDATE essay_coach_requests SET status='ready',result='{result}' WHERE id='{request}' AND firm_id='{firm}';COMMIT;")

    def publish(_):
        try:
            sql(auth + f"SELECT public.publish_essay_coaching('{firm}','{actor}','{request}',0,'My reviewed question');COMMIT;")
            return True
        except RuntimeError as e:
            assert any(s in str(e) for s in ['Coaching suggestion unavailable', 'duplicate key']), str(e)
            return False
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        assert sum(pool.map(publish, range(20))) == 1
    assert sql(f"SELECT count(*) FROM essay_feedback WHERE firm_id='{firm}' AND essay_draft_id='{essay}'") == '1'

    def reserve(i):
        kind = i % 3
        try:
            value = sql(auth + [coach, planning, interview][kind] + 'COMMIT;')
            return (kind, value)
        except RuntimeError as e:
            assert 'AI request limit reached' in str(e), str(e)
            return None
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        reserved = [r for r in pool.map(reserve, range(30)) if r]
    interview_ids = [value for kind, value in reserved if kind == 2]
    assert len(reserved) == 9, reserved  # Initial coaching request already used one.
    assert sql(f"SELECT (SELECT count(*) FROM essay_coach_request_usage WHERE firm_id='{firm}' AND owner_user_id='{actor}')+(SELECT count(*) FROM essay_ai_request_usage WHERE firm_id='{firm}' AND owner_user_id='{actor}')+(SELECT count(*) FROM student_ai_request_usage WHERE firm_id='{firm}' AND owner_user_id='{actor}')") == '10'
    assert sql(f"SELECT body FROM essay_drafts WHERE id='{essay}' AND firm_id='{firm}'") == 'Preserved working writing'
    assert sql(f"SELECT body FROM essay_draft_versions WHERE id='{version}'") == 'One exact saved passage.'
    print('Twenty concurrent publications saved one reviewed comment; thirty mixed interview/planning/coaching reservations stopped at ten total. Working and saved writing stayed unchanged.')
finally:
    for request_id in interview_ids:
        uuid.UUID(request_id)
        sql(f"DELETE FROM student_ai_requests WHERE firm_id='{firm}' AND id='{request_id}';")
    sql(f"DELETE FROM essay_feedback WHERE firm_id='{firm}' AND essay_draft_id='{essay}'; DELETE FROM essay_drafts WHERE firm_id='{firm}' AND id='{essay}'; DELETE FROM student_story_bank WHERE firm_id='{firm}' AND id='{bank}';")
