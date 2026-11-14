"""Concurrent planning saves; disposable localhost verification database only."""
import concurrent.futures
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

try:
    sql(f"""INSERT INTO essay_drafts(id,firm_id,student_id,essay_type,title,body,visibility_scope,created_by_user_id,updated_by_user_id)
      VALUES('{essay}','{firm}','{student}','supplemental','Planning race','Preserved writing','student','{actor}','{actor}');
      INSERT INTO student_story_bank(id,firm_id,student_id,kind,title,body,audience,review_state,created_by_user_id)
      VALUES('{story}','{firm}','{student}','story','Planning race story','A scene','counselor','draft','{actor}');""")
    query = f"""BEGIN; SET LOCAL request.jwt.claims='{{"sub":"test_clerk_alpha_counselor"}}'; SET LOCAL ROLE authenticated;
      SELECT public.save_essay_plan('{firm}','{actor}','{essay}',0,'{{}}',ARRAY['{story}']::uuid[],'experience','A proposed angle','draft',false,jsonb_build_array(jsonb_build_object('id','{story}','revision',1))); COMMIT;"""
    def attempt(_):
        try:
            return 'saved', sql(query)
        except RuntimeError as error:
            assert 'changed in another window' in str(error), str(error)
            return 'conflict', ''
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(attempt, range(12)))
    assert sum(result[0] == 'saved' for result in results) == 1, results
    assert sum(result[0] == 'conflict' for result in results) == 11, results
    assert sql(f"SELECT count(*) FROM student_essay_plans WHERE essay_id='{essay}'") == '1'
    assert sql(f"SELECT count(*) FROM student_story_essay_links WHERE essay_id='{essay}'") == '1'
    assert sql(f"SELECT body FROM essay_drafts WHERE id='{essay}'") == 'Preserved writing'
    print('12 concurrent saves produced one plan and one connection; 11 stale writers were rejected without changing essay writing.')
finally:
    sql(f"DELETE FROM essay_drafts WHERE id='{essay}'; DELETE FROM student_story_bank WHERE id='{story}';")
