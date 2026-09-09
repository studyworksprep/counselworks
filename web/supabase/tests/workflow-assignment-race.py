"""Real concurrent single/cohort assignment transactions; disposable database only."""
import concurrent.futures
import json
import os
import subprocess
import uuid

url = os.environ['DATABASE_URL']
psql = os.environ.get('PSQL', 'psql')
def sql(query):
    result = subprocess.run([psql, url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], input=query, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()

firm = 'a0000000-0000-4000-8000-000000000001'
actor = 'a0000000-0000-4000-8000-000000000012'
student = 'a0000000-0000-4000-8000-000000000041'
owner = 'a0000000-0000-4000-8000-000000000015'
template, step = [str(uuid.uuid4()) for _ in range(2)]
try:
    sql(f"""BEGIN;
      INSERT INTO workflow_templates(id,firm_id,name,workflow_type) VALUES('{template}','{firm}','Disposable assignment race','custom');
      INSERT INTO workflow_template_steps(id,workflow_template_id,name,step_order,step_type,visibility_scope)
        VALUES('{step}','{template}','First task',0,'task','student');
      COMMIT;""")
    def assign(_):
        result = json.loads(sql(f"""BEGIN; SET LOCAL ROLE authenticated;
          SET LOCAL request.jwt.claims='{{"sub":"test_clerk_alpha_counselor","role":"authenticated"}}';
          SELECT create_workflow_instance('{firm}','{actor}','{student}','{template}','{{"name":"Same plan"}}',
            '[{{"template_step_id":"{step}","assigned_user_id":"{owner}","due_date":"2026-11-01"}}]'); COMMIT;"""))
        instance_step = result['student_workflow_steps'][0]['id']
        task = sql(f"""BEGIN; SET LOCAL ROLE authenticated;
          SET LOCAL request.jwt.claims='{{"sub":"test_clerk_alpha_counselor","role":"authenticated"}}';
          SELECT materialize_workflow_task('{instance_step}','{firm}','{actor}','{owner}','student',true); COMMIT;""")
        return result['id'], instance_step, task
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(assign, range(12)))
    assert len(set(results)) == 1, results
    assert sql(f"SELECT count(*) FROM student_workflows WHERE firm_id='{firm}' AND workflow_template_id='{template}'") == '1'
    assert sql(f"SELECT count(*) FROM student_workflow_steps WHERE template_step_id='{step}'") == '1'
    print('12 concurrent assignments returned one plan, one step, and one linked task.')
finally:
    sql(f"""BEGIN;
      CREATE TEMP TABLE cleanup_tasks AS SELECT linked_task_id id FROM student_workflow_steps WHERE template_step_id='{step}';
      DELETE FROM student_workflows WHERE firm_id='{firm}' AND workflow_template_id='{template}';
      DELETE FROM tasks WHERE firm_id='{firm}' AND id IN (SELECT id FROM cleanup_tasks);
      DELETE FROM workflow_templates WHERE firm_id='{firm}' AND id='{template}'; COMMIT;""")
