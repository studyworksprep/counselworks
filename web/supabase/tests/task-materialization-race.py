"""Race the real materialization RPC in separate transactions (disposable DB only)."""
import concurrent.futures
import os
import subprocess
import uuid

url = os.environ['DATABASE_URL']
psql = os.environ.get('PSQL', 'psql')
def sql(query):
    run = subprocess.run([psql, url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], input=query, text=True, capture_output=True)
    if run.returncode:
        raise RuntimeError(run.stderr)
    return run.stdout.strip()

firm = 'a0000000-0000-4000-8000-000000000001'
actor = 'a0000000-0000-4000-8000-000000000012'
student = 'a0000000-0000-4000-8000-000000000041'
owner = 'a0000000-0000-4000-8000-000000000015'
template, template_step, workflow, step = [str(uuid.uuid4()) for _ in range(4)]
try:
    sql(f"""BEGIN;
      INSERT INTO workflow_templates(id,firm_id,name,workflow_type) VALUES('{template}','{firm}','Disposable race','custom');
      INSERT INTO workflow_template_steps(id,workflow_template_id,name,step_order,step_type,visibility_scope)
        VALUES('{template_step}','{template}','Race task',0,'task','student');
      INSERT INTO student_workflows(id,firm_id,student_id,workflow_template_id,created_by_user_id)
        VALUES('{workflow}','{firm}','{student}','{template}','{actor}');
      INSERT INTO student_workflow_steps(id,student_workflow_id,template_step_id,status,assigned_user_id)
        VALUES('{step}','{workflow}','{template_step}','pending','{owner}');
      COMMIT;""")
    def materialize(_):
        return sql(f"""BEGIN; SET LOCAL ROLE authenticated;
          SET LOCAL request.jwt.claims='{{"sub":"test_clerk_alpha_counselor","role":"authenticated"}}';
          SELECT materialize_workflow_task('{step}','{firm}','{actor}','{owner}','student',true);
          SELECT pg_sleep(0.05); COMMIT;""").splitlines()[0]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        ids = list(pool.map(materialize, range(12)))
    assert len(set(ids)) == 1 and ids[0], ids
    assert sql(f"SELECT count(*) FROM tasks WHERE firm_id='{firm}' AND id IN ({','.join(repr(i) for i in ids)})") == '1'
    assert sql(f"SELECT linked_task_id FROM student_workflow_steps WHERE id='{step}'") == ids[0]
    print('12 concurrent materialization attempts returned one linked task.')
finally:
    sql(f"""BEGIN;
      CREATE TEMP TABLE race_cleanup AS SELECT linked_task_id id FROM student_workflow_steps WHERE id='{step}';
      DELETE FROM student_workflows WHERE id='{workflow}' AND firm_id='{firm}';
      DELETE FROM tasks WHERE firm_id='{firm}' AND id IN (SELECT id FROM race_cleanup);
      DELETE FROM workflow_templates WHERE id='{template}' AND firm_id='{firm}';
      COMMIT;""")
