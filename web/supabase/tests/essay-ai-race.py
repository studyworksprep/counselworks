"""Single-use acceptance and the shared AI quota under concurrent local writers."""
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
essay, story = str(uuid.uuid4()), str(uuid.uuid4())

def sql(query):
    result = subprocess.run(['psql', url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], input=query, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()

auth = "BEGIN; SET LOCAL request.jwt.claims='{\"sub\":\"test_clerk_alpha_counselor\"}'; SET LOCAL ROLE authenticated;"
refs = f"(SELECT jsonb_agg(jsonb_build_object('kind',s->'kind','id',s->'id','revision',s->'revision','stamp',s->'stamp')) FROM jsonb_array_elements(public.essay_ai_sources('{firm}','{actor}','{student}',false)) s WHERE s->>'id'='{story}')"
reserve = f"INSERT INTO essay_ai_requests(firm_id,student_id,essay_id,owner_user_id,mode,source_refs,task_stamp) VALUES('{firm}','{student}','{essay}','{actor}','{{mode}}',{refs},public.essay_ai_task_stamp('{firm}','{actor}','{essay}')) RETURNING id;"

def race(query, accepted_error):
    def attempt(_):
        try:
            sql(query)
            return True
        except RuntimeError as error:
            assert any(message in str(error) for message in accepted_error), str(error)
            return False
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        return list(pool.map(attempt, range(20)))

try:
    sql(f"""INSERT INTO essay_drafts(id,firm_id,student_id,essay_type,title,prompt_text,body,visibility_scope,created_by_user_id,updated_by_user_id)
      VALUES('{essay}','{firm}','{student}','supplemental','AI acceptance race','Describe a decision.','Preserved student writing','student','{actor}','{actor}');
      INSERT INTO student_story_bank(id,firm_id,student_id,kind,title,body,audience,review_state,created_by_user_id)
      VALUES('{story}','{firm}','{student}','story','A real decision','A scene','counselor','confirmed','{actor}');""")
    request = sql(auth + reserve.format(mode='story_matches') + 'COMMIT;')
    result = json.dumps({'matches': [{'entryIds': [story]}]})
    sql(auth + f"UPDATE essay_ai_requests SET status='ready',result='{result}' WHERE firm_id='{firm}' AND id='{request}';COMMIT;")
    attempts = race(auth + f"SELECT public.accept_essay_ai_suggestion('{firm}','{actor}','{request}',0,'Which decision matters?',NULL);COMMIT;", ['Suggestion already used or unavailable', 'Essay or cited context changed'])
    assert sum(attempts) == 1, attempts
    assert sql(f"SELECT count(*) FROM student_essay_plans WHERE firm_id='{firm}' AND essay_id='{essay}'") == '1'
    assert sql(f"SELECT count(*) FROM student_story_essay_links WHERE firm_id='{firm}' AND essay_id='{essay}'") == '1'
    request = sql(auth + reserve.format(mode='outline') + 'COMMIT;')
    sql(auth + f"UPDATE essay_ai_requests SET status='ready',result='{{}}' WHERE firm_id='{firm}' AND id='{request}';COMMIT;")
    content = json.dumps({'purpose': 'What changed?', 'beats': [{'id': str(uuid.uuid4()), 'heading': 'A decision', 'notes': 'Which details do you remember?', 'entry_ids': [story]}]})
    attempts = race(auth + f"SELECT public.accept_essay_ai_suggestion('{firm}','{actor}','{request}',0,'','{content}');COMMIT;", ['Suggestion already used or unavailable', 'Essay or cited context changed'])
    assert sum(attempts) == 1, attempts
    assert sql(f"SELECT count(*) FROM student_essay_outlines WHERE firm_id='{firm}' AND essay_id='{essay}'") == '1'
    attempts = race(auth + reserve.format(mode='story_matches') + 'COMMIT;', ['AI request limit reached'])
    assert sum(attempts) == 8, attempts  # Two requests already reserved above.
    assert sql(f"SELECT count(*) FROM essay_ai_request_usage WHERE firm_id='{firm}' AND owner_user_id='{actor}'") == '10'
    assert sql(f"SELECT body FROM essay_drafts WHERE firm_id='{firm}' AND id='{essay}'") == 'Preserved student writing'
    print('20 concurrent plan accepts and 20 outline accepts each saved once; 20 quota reservations stopped at the shared ten-request allowance. Student writing stayed unchanged.')
finally:
    sql(f"DELETE FROM essay_drafts WHERE firm_id='{firm}' AND id='{essay}'; DELETE FROM student_story_bank WHERE firm_id='{firm}' AND id='{story}';")
