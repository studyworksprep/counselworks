"""Concurrent history, single enrollment, follow-up and consent checks on a disposable DB."""
import concurrent.futures
import os
import subprocess
import uuid
from urllib.parse import urlparse

url = os.environ['DATABASE_URL']
target = urlparse(url)
assert target.hostname in ('localhost', '127.0.0.1') and (target.path.endswith('_test') or target.path == '/cw_decision_verify')
firm, staff, learner, parent, student = [f'a0000000-0000-4000-8000-0000000000{x}' for x in ('01', '12', '15', '13', '41')]
colleges, schools, apps = [[str(uuid.uuid4()) for _ in range(2)] for _ in range(3)]

def sql(query):
    r = subprocess.run(['psql', url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], input=query, text=True, capture_output=True)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return r.stdout.strip()

def auth(role):
    return f"BEGIN; SET LOCAL request.jwt.claims='{{\"sub\":\"test_clerk_alpha_{role}\"}}'; SET LOCAL ROLE authenticated;"

def attempt(query):
    try:
        return sql(query)
    except RuntimeError as error:
        return str(error)

def race(queries):
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        return list(pool.map(attempt, queries))

def decision(index, revision, result, deposit='NULL'):
    return f"{auth('counselor')} SELECT public.record_application_decision('{firm}','{staff}','{apps[index]}',{revision},'{result}',(now() AT TIME ZONE (SELECT coalesce(timezone,'America/New_York') FROM firms WHERE id='{firm}'))::date,{deposit});COMMIT;"

try:
    for college, school, app in zip(colleges, schools, apps):
        sql(f"""INSERT INTO colleges(id,name,slug) VALUES('{college}','Decision race','decision-race-{college}');
        INSERT INTO student_colleges(id,firm_id,student_id,college_id,category,created_by_user_id,updated_by_user_id) VALUES('{school}','{firm}','{student}','{college}','target','{staff}','{staff}');
        INSERT INTO applications(id,firm_id,student_id,student_college_id,college_id,application_type,stage,created_by_user_id,updated_by_user_id) VALUES('{app}','{firm}','{student}','{school}','{college}','rd','submitted','{staff}','{staff}');""")
    results = race([decision(0, 0, 'waitlisted'), decision(0, 0, 'deferred')])
    assert results.count('1') == 1 and sum('Decision changed' in r for r in results) == 1, results
    assert sql(f"SELECT count(*) FROM application_decision_events WHERE application_id='{apps[0]}'") == '1'
    sql(decision(0, 1, 'waitlisted'))
    sql(f"{auth('counselor')} SELECT public.initialize_decision_checklist('{firm}','{staff}','{apps[0]}',2);COMMIT;")
    step = sql(f"SELECT id FROM application_next_steps WHERE application_id='{apps[0]}' AND template_key='letter'")
    create = f"{auth('counselor')} SELECT public.schedule_application_next_step('{firm}','{staff}','{step}',1,'{learner}',current_date);COMMIT;"
    ids = race([create, create])
    assert len(ids[0]) == 36 and ids[0] == ids[1], ids
    task = ids[0]
    sql(f"{auth('student')} UPDATE application_next_steps SET family_shared=true,revision=2,updated_by_user_id='{learner}' WHERE id='{step}';COMMIT;")
    revision = sql(f"SELECT notice_revision FROM tasks WHERE id='{task}'")
    sql(f"{auth('counselor')} SELECT public.schedule_application_next_step('{firm}','{staff}','{step}',2,'{parent}',current_date,'{task}',{revision});COMMIT;")
    withdraw = f"{auth('student')} UPDATE application_next_steps SET family_shared=false,revision=3,updated_by_user_id='{learner}' WHERE id='{step}';COMMIT;"
    complete = f"{auth('parent1')} SELECT public.transition_task('{firm}','{parent}','{task}','completed');COMMIT;"
    outcomes = race([withdraw, complete])
    assert 'ERROR' not in outcomes[0], outcomes
    assert sql(f"SELECT visibility_scope FROM tasks WHERE id='{task}'") == 'student'
    assert sql(f"SELECT public.task_notice_allowed('{task}','{parent}')") == 'f'
    assert sql(f"{auth('parent1')} SELECT count(*) FROM tasks WHERE id='{task}';COMMIT;") == '0'
    results = race([decision(0, 2, 'accepted', "'committed'"), decision(1, 0, 'accepted', "'committed'")])
    assert sum(r in ('1', '3') for r in results) == 1 and sum('Another college' in r for r in results) == 1, results
    assert sql(f"SELECT count(*) FROM student_colleges WHERE firm_id='{firm}' AND student_id='{student}' AND deposit_status='committed'") == '1'
    if results[0] == '3':
        assert sql(f"SELECT status IN ('completed','cancelled') FROM tasks WHERE id='{task}'") == 't'
    print('PASS: versioned decisions, one committed college, duplicate follow-up prevention and consent races')
finally:
    for college, school, app in zip(colleges, schools, apps):
        sql(f"DELETE FROM tasks WHERE firm_id='{firm}' AND application_id='{app}';DELETE FROM application_next_steps WHERE firm_id='{firm}' AND application_id='{app}';DELETE FROM applications WHERE firm_id='{firm}' AND id='{app}';DELETE FROM student_colleges WHERE firm_id='{firm}' AND id='{school}';DELETE FROM colleges WHERE id='{college}';")
