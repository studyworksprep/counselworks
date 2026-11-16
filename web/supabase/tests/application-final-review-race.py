"""Approval conflicts and a submission waiting behind an essay save, on a disposable DB."""
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
staff = 'a0000000-0000-4000-8000-000000000012'
learner = 'a0000000-0000-4000-8000-000000000015'
college, school, app, essay = [str(uuid.uuid4()) for _ in range(4)]
cmd = ['psql', url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']


def sql(query):
    result = subprocess.run(cmd, input=query, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def auth(role):
    return f"BEGIN; SET LOCAL request.jwt.claims='{{\"sub\":\"test_clerk_alpha_{role}\"}}'; SET LOCAL ROLE authenticated;"


try:
    sql(f"""INSERT INTO colleges(id,name,slug) VALUES('{college}','Packet race','packet-race-{college}');
    INSERT INTO student_colleges(id,firm_id,student_id,college_id,category,created_by_user_id,updated_by_user_id)
      VALUES('{school}','{firm}','{student}','{college}','target','{staff}','{staff}');
    INSERT INTO applications(id,firm_id,student_id,student_college_id,college_id,application_type,stage,created_by_user_id,updated_by_user_id)
      VALUES('{app}','{firm}','{student}','{school}','{college}','rd','in_progress','{staff}','{staff}');
    INSERT INTO essay_drafts(id,firm_id,student_id,application_id,essay_type,title,body,visibility_scope,created_by_user_id,updated_by_user_id)
      VALUES('{essay}','{firm}','{student}','{app}','supplemental','Race response','The reviewed writing.','student','{staff}','{staff}');
    INSERT INTO essay_draft_versions(essay_draft_id,version_number,body,created_by_user_id) VALUES('{essay}',1,'The reviewed writing.','{staff}');""")
    preview = json.loads(sql(f"SELECT public.application_review_preview('{firm}','{staff}','{app}')"))
    manifest = json.dumps(preview['manifest']).replace("'", "''")
    packet = sql(f"""{auth('counselor')} INSERT INTO application_review_packets(firm_id,student_id,application_id,fingerprint,manifest,created_by_user_id,updated_by_user_id)
      VALUES('{firm}','{student}','{app}','{preview['fingerprint']}','{manifest}'::jsonb,'{staff}','{staff}') RETURNING id;COMMIT;""")
    approve = f"{auth('counselor')} SELECT public.update_application_packet('{firm}','{staff}','{packet}',1,'approve_counselor');COMMIT;"

    def attempt(_):
        try:
            sql(approve)
            return 'approved'
        except RuntimeError as error:
            assert 'changed in another window' in str(error), str(error)
            return 'conflict'

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(attempt, range(8)))
    assert results.count('approved') == 1 and results.count('conflict') == 7, results
    sql(f"{auth('student')} SELECT public.update_application_packet('{firm}','{learner}','{packet}',2,'approve_student');COMMIT;")

    # The writer holds the exact source row before the submitter starts. The
    # handoff must see the newly committed version when its row lock resumes.
    writer = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
    writer.stdin.write(f"{auth('counselor')} SELECT id FROM essay_drafts WHERE firm_id='{firm}' AND id='{essay}' FOR UPDATE;\n\\echo LOCKED\n")
    writer.stdin.flush()
    while writer.stdout.readline().strip() != 'LOCKED':
        assert writer.poll() is None, 'Writer failed before locking source'
    submit = f"{auth('student')} SELECT public.update_application_packet('{firm}','{learner}','{packet}',3,'submit',(now() AT TIME ZONE (SELECT timezone FROM firms WHERE id='{firm}'))::date,'Common App','RACE');COMMIT;"
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(sql, submit)
        writer.stdin.write(f"SELECT pg_sleep(0.3); SELECT public.write_essay('{firm}','{staff}','{essay}','save','Changed while handoff waited.');COMMIT;\n")
        writer.stdin.close()
        assert writer.wait(timeout=10) == 0, writer.stderr.read()
        try:
            pending.result(timeout=10)
            raise AssertionError('Stale submission was recorded after a concurrent save')
        except RuntimeError as error:
            assert 'outdated' in str(error), str(error)
    assert sql(f"SELECT stage FROM applications WHERE firm_id='{firm}' AND id='{app}'") == 'in_progress'
    assert sql(f"SELECT count(*) FROM application_review_packets WHERE firm_id='{firm}' AND id='{packet}' AND submitted_on IS NOT NULL") == '0'
    print('Eight approval writers: one approval, seven conflicts. Submission waited for the essay save and rejected the stale packet.')
finally:
    sql(f"""DELETE FROM essay_draft_versions WHERE essay_draft_id='{essay}';
      DELETE FROM essay_drafts WHERE firm_id='{firm}' AND id='{essay}';
      DELETE FROM applications WHERE firm_id='{firm}' AND id='{app}';
      DELETE FROM student_colleges WHERE firm_id='{firm}' AND id='{school}';
      DELETE FROM colleges WHERE id='{college}';""")
