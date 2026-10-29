-- request.sql에서 센서 로그 INSERT만 뺀 것: 센서 저장이 빠지면 요청 1건의 DB 시간이 얼마나 줄어드나
-- pgbench -r로 문장별 시간을 본다. HTTP · JSON · Spring 시간은 빠진 DB만의 시간이다.
\set dev random(1, 200)
BEGIN;
SELECT run_id::text FROM producer_run WHERE id = 1;
SELECT 1 FROM pg_advisory_xact_lock(4201);
UPDATE work_order w SET status = 'COMPLETED', completed_at = now()
WHERE w.status = 'IN_PROGRESS'
  AND COALESCE((SELECT p.good_count FROM production_performance p
                WHERE p.work_order_id = w.work_order_id
                  AND p.equipment_id = (SELECT equipment_id FROM equipment ORDER BY line_order DESC LIMIT 1)), 0) >= w.planned_qty;
UPDATE work_order SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, now())
WHERE work_order_id = (SELECT work_order_id FROM work_order WHERE status = 'RELEASED'
                       ORDER BY priority DESC, released_at, work_order_id LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM work_order WHERE status = 'IN_PROGRESS');
SELECT w.work_order_id, w.planned_qty FROM work_order w JOIN item i ON i.item_code = w.item_code WHERE w.status = 'IN_PROGRESS';
COMMIT;
