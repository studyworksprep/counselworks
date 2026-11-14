"""One outline winner and idempotent revision tasks on a disposable local DB."""
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
essay, feedback, beat = [str(uuid.uuid4()) for _ in range(3)]

def sql(query):
    result = subprocess.run(['psql', url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], input=query, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()

try:
    sql(f"""INSERT INTO essay_drafts(id,firm_id,student_id,essay_type,title,body,visibility_scope,created_by_user_id,updated_by_user_id)
      VALUES('{essay}','{firm}','{student}','supplemental','Drafting race','Preserved writing','student','{actor}','{actor}');
      INSERT INTO essay_draft_versions(essay_draft_id,version_number,body,created_by_user_id) VALUES('{essay}',1,'Preserved writing','{actor}');
      INSERT INTO essay_feedback(id,firm_id,essay_draft_id,version_number,author_user_id,body) VALUES('{feedback}','{firm}','{essay}',1,'{actor}','Show the impact.');""")
    content = json.dumps({'purpose': 'A distinct contribution', 'beats': [{'id': beat, 'heading': 'Opening', 'notes': 'A specific scene', 'entry_ids': []}]})
    context = sql(f"SELECT public.essay_outline_context('{firm}','{essay}')")
    auth = "BEGIN; SET LOCAL request.jwt.claims='{\"sub\":\"test_clerk_alpha_counselor\"}'; SET LOCAL ROLE authenticated;"
    query = f"{auth} SELECT public.save_essay_outline('{firm}','{actor}','{essay}',0,'{content}'::jsonb,'{context}'::jsonb,'draft',false);COMMIT;"
    def attempt(_):
        try:
            sql(query)
            return 'saved'
        except RuntimeError as error:
            assert 'changed in another window' in str(error), str(error)
            return 'conflict'
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(attempt, range(12)))
    assert results.count('saved') == 1 and results.count('conflict') == 11, results
    task_query = f"{auth} SELECT public.create_essay_revision_task('{firm}','{actor}','{feedback}','Revise the impact','Add a real result.',NULL);COMMIT;"
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        task_ids = list(pool.map(lambda _: sql(task_query), range(12)))
    assert len(set(task_ids)) == 1, task_ids
    assert sql(f"SELECT count(*) FROM tasks WHERE firm_id='{firm}' AND essay_feedback_id='{feedback}'") == '1'
    # Assignment and withdrawal serialize on the source essay. Either assignment
    # is rejected or its task is narrowed by withdrawal; it cannot remain shared.
    for trial in range(3):
        sql(f"DELETE FROM tasks WHERE firm_id='{firm}' AND essay_feedback_id='{feedback}';UPDATE essay_drafts SET visibility_scope='student' WHERE id='{essay}';")
        def assign_during_withdrawal():
            try:
                return sql(task_query)
            except RuntimeError as error:
                assert 'Reopen and share the essay' in str(error), str(error)
                return 'withdrawn'
        withdraw = f"{auth} UPDATE essay_drafts SET visibility_scope='staff',updated_by_user_id='{actor}' WHERE firm_id='{firm}' AND id='{essay}';COMMIT;"
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(assign_during_withdrawal), pool.submit(sql, withdraw)]
            for future in futures:
                future.result()
        assert sql(f"SELECT count(*) FROM tasks WHERE firm_id='{firm}' AND essay_feedback_id='{feedback}' AND visibility_scope<>'staff'") == '0'
    assert sql(f"SELECT body FROM essay_drafts WHERE id='{essay}'") == 'Preserved writing'
    print('12 outline writers: one save, 11 retained conflicts. 12 task retries: one revision task. Withdrawal races retained privacy. Writing preserved.')
finally:
    sql(f"DELETE FROM tasks WHERE firm_id='{firm}' AND essay_feedback_id='{feedback}';DELETE FROM essay_drafts WHERE id='{essay}';")
