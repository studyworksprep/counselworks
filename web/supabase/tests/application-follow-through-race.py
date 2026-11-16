"""Concurrent follow-up creation, rescheduling and consent withdrawal on a disposable DB."""
import concurrent.futures
import os
import subprocess
import uuid
from urllib.parse import urlparse

url = os.environ['DATABASE_URL']
target = urlparse(url)
assert target.hostname in ('localhost', '127.0.0.1') and (target.path.endswith('_test') or target.path == '/cw_follow_through_sql')
firm, staff, learner, parent, student = [f'a0000000-0000-4000-8000-0000000000{x}' for x in ('01', '12', '15', '13', '41')]
college, school, app, item = [str(uuid.uuid4()) for _ in range(4)]

def sql(query):
    result = subprocess.run(['psql', url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], input=query, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()

def auth(role):
    return f"BEGIN; SET LOCAL request.jwt.claims='{{\"sub\":\"test_clerk_alpha_{role}\"}}'; SET LOCAL ROLE authenticated;"

def attempt(query):
    try:
        return sql(query)
    except RuntimeError as error:
        return str(error)

try:
    sql(f"""INSERT INTO colleges(id,name,slug) VALUES('{college}','Follow-through race','follow-race-{college}');
    INSERT INTO student_colleges(id,firm_id,student_id,college_id,category,created_by_user_id,updated_by_user_id) VALUES('{school}','{firm}','{student}','{college}','target','{staff}','{staff}');
    INSERT INTO applications(id,firm_id,student_id,student_college_id,college_id,application_type,stage,created_by_user_id,updated_by_user_id) VALUES('{app}','{firm}','{student}','{school}','{college}','rd','submitted','{staff}','{staff}');
    INSERT INTO application_follow_through_items(id,firm_id,student_id,application_id,kind,title,status,created_by_user_id,updated_by_user_id) VALUES('{item}','{firm}','{student}','{app}','material','Transcript','needed','{staff}','{staff}');""")
    create = f"{auth('counselor')} SELECT public.create_application_follow_up('{firm}','{staff}','{item}',1,'{learner}',current_date);COMMIT;"
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        ids = list(pool.map(attempt, [create, create]))
    assert ids[0] == ids[1] and len(ids[0]) == 36, ids
    task = ids[0]
    revision = sql(f"SELECT notice_revision FROM tasks WHERE id='{task}'")
    def schedule(days):
        return f"{auth('counselor')} SELECT public.create_application_follow_up('{firm}','{staff}','{item}',1,'{learner}',current_date+{days},'{task}',{revision});COMMIT;"
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(attempt, [schedule(1), schedule(2)]))
    assert sum(result == task for result in results) == 1 and sum('changed in another window' in result for result in results) == 1, results
    sql(f"{auth('student')} UPDATE application_follow_through_items SET family_shared=true,revision=2,updated_by_user_id='{learner}' WHERE id='{item}';COMMIT;")
    revision = sql(f"SELECT notice_revision FROM tasks WHERE id='{task}'")
    sql(f"{auth('counselor')} SELECT public.create_application_follow_up('{firm}','{staff}','{item}',2,'{parent}',current_date,'{task}',{revision});COMMIT;")
    withdraw = f"{auth('student')} UPDATE application_follow_through_items SET family_shared=false,revision=3,updated_by_user_id='{learner}' WHERE id='{item}';COMMIT;"
    complete = f"{auth('parent1')} SELECT public.transition_task('{firm}','{parent}','{task}','completed');COMMIT;"
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(attempt, [withdraw, complete]))
    assert 'ERROR' not in outcomes[0], outcomes
    assert sql(f"SELECT family_shared::text FROM application_follow_through_items WHERE id='{item}'") == 'false'
    assert sql(f"SELECT visibility_scope FROM tasks WHERE id='{task}'") == 'student'
    assert sql(f"SELECT public.task_notice_allowed('{task}','{parent}')") == 'f'
    assert sql(f"{auth('parent1')} SELECT count(*) FROM tasks WHERE id='{task}';COMMIT;") == '0'
    print('PASS: one follow-up, stale reschedule rejected, concurrent consent withdrawal protects tasks and reminders')
finally:
    sql(f"DELETE FROM tasks WHERE firm_id='{firm}' AND application_id='{app}';DELETE FROM application_follow_through_items WHERE firm_id='{firm}' AND application_id='{app}';DELETE FROM applications WHERE firm_id='{firm}' AND id='{app}';DELETE FROM student_colleges WHERE firm_id='{firm}' AND id='{school}';DELETE FROM colleges WHERE id='{college}';")
