-- Read-only, firm-scoped audit. Run with psql -v firm_id=<reviewed firm UUID>.
-- No updates: a counselor must establish intent before remediating each row.
BEGIN READ ONLY;
SELECT t.id, t.student_id, t.assigned_user_id, t.created_by_user_id,
       t.task_type, t.status, t.visibility_scope,
       CASE WHEN t.assigned_user_id IS NULL THEN 'No recorded owner'
            ELSE 'Legacy owner intent requires counselor review' END AS review_reason
FROM tasks t
WHERE t.firm_id = :'firm_id'::uuid
  AND t.student_id IS NOT NULL
  AND t.owner_role IS NULL
  AND t.archived_at IS NULL
ORDER BY t.student_id, t.created_at, t.id;
ROLLBACK;
