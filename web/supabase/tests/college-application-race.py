"""Concurrent application creation; disposable localhost verification database only."""
import concurrent.futures
import json
import os
import subprocess
import uuid
from urllib.parse import urlparse

url = os.environ['DATABASE_URL']
target = urlparse(url)
assert target.hostname in ('localhost', '127.0.0.1')
assert target.path.endswith('_test') or target.path.startswith('/cw_connected_')
firm = 'a0000000-0000-4000-8000-000000000001'
actor = 'a0000000-0000-4000-8000-000000000012'
student = 'a0000000-0000-4000-8000-000000000041'
college, prompt_set, prompt = [str(uuid.uuid4()) for _ in range(3)]
scorecard = 1000000 + int(uuid.uuid4().hex[:6], 16)

def sql(query):
    result = subprocess.run(['psql', url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], input=query, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()

try:
    sql(f"""INSERT INTO colleges(id,name,slug,scorecard_id) VALUES('{college}','Concurrent test','race-{college}',{scorecard});
      INSERT INTO college_prompt_sets(id,scorecard_id,college_name,entry_year,coverage,source_url,verified_on)
        SELECT '{prompt_set}',{scorecard},'Concurrent test',graduation_year,'verified','https://example.edu',CURRENT_DATE FROM students WHERE id='{student}';
      INSERT INTO college_library_prompts(id,prompt_set_id,prompt_key,title,prompt_text,requirement)
        VALUES('{prompt}','{prompt_set}','required','Race response','Describe a project.','required');""")
    query = f"""BEGIN; SET LOCAL request.jwt.claims='{{"sub":"test_clerk_alpha_counselor"}}'; SET LOCAL ROLE authenticated;
      SELECT public.create_student_application('{firm}','{actor}','{student}','{college}','rd',NULL,'estimate','[]'); COMMIT;"""
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(lambda _: json.loads(sql(query)), range(12)))
    assert len({result['id'] for result in results}) == 1, results
    assert sum(result['created'] for result in results) == 1, results
    assert sql(f"SELECT count(*) FROM student_colleges WHERE college_id='{college}'") == '1'
    assert sql(f"SELECT count(*) FROM applications WHERE college_id='{college}'") == '1'
    assert sql(f"SELECT count(*) FROM essay_drafts WHERE library_prompt_id='{prompt}'") == '1'
    assert sql(f"SELECT count(*) FROM essay_draft_versions v JOIN essay_drafts e ON e.id=v.essay_draft_id WHERE e.library_prompt_id='{prompt}'") == '1'
    print('12 concurrent requests produced one college, one application, one draft, and one initial version.')
finally:
    sql(f"""DELETE FROM essay_drafts WHERE library_prompt_id='{prompt}';
      DELETE FROM applications WHERE college_id='{college}';
      DELETE FROM student_colleges WHERE college_id='{college}';
      DELETE FROM college_library_prompts WHERE id='{prompt}';
      DELETE FROM college_prompt_sets WHERE id='{prompt_set}';
      DELETE FROM colleges WHERE id='{college}';""")
