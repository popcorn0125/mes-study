-- 조회 비교 쿼리. "-- name: X" 아래 본문을 run-queries.sh가 꺼내 EXPLAIN (ANALYZE, BUFFERS)로 돌린다.
-- 기준 시각은 now() 대신 데이터 마지막 시각(:'t_end')이라 언제 돌려도 같은 결과가 나온다.
-- 원본(raw) 쿼리는 지금 백엔드(OeeMapper.sumSeconds · SensorLogQueryMapper.countStatusSeconds)와 같은 모양이다.

-- name: oee_today_raw
-- OEE 요약 "오늘": 24시간(자정 직전이 최악) 설비별 상태 초
SELECT equipment_id, count(*) AS planned_sec,
       count(*) FILTER (WHERE status IN ('RUN', 'WARN')) AS run_sec,
       count(*) FILTER (WHERE status = 'DOWN') AS down_sec,
       count(*) FILTER (WHERE status = 'IDLE') AS idle_sec
FROM equipment_sensor_log
WHERE work_order_id IS NOT NULL
  AND recorded_at >= :'t_end'::timestamptz - INTERVAL '24 hours' AND recorded_at < :'t_end'::timestamptz
GROUP BY 1;

-- name: oee_trend_today_raw
-- OEE 추이 "오늘": 설비 · 1시간 칸마다 상태 초
SELECT equipment_id, date_bin(INTERVAL '1 hour', recorded_at, TIMESTAMPTZ '2000-01-01 00:00:00+09') AS bucket_start,
       count(*) AS planned_sec,
       count(*) FILTER (WHERE status IN ('RUN', 'WARN')) AS run_sec,
       count(*) FILTER (WHERE status = 'DOWN') AS down_sec,
       count(*) FILTER (WHERE status = 'IDLE') AS idle_sec
FROM equipment_sensor_log
WHERE work_order_id IS NOT NULL
  AND recorded_at >= :'t_end'::timestamptz - INTERVAL '24 hours' AND recorded_at < :'t_end'::timestamptz
GROUP BY 1, 2;

-- name: oee_7d_raw
-- 주간 리포트(7일) 설비별 상태 초: 지금 화면에는 없지만 실적 리포트에서 쓸 구간
SELECT equipment_id, count(*) AS planned_sec,
       count(*) FILTER (WHERE status IN ('RUN', 'WARN')) AS run_sec,
       count(*) FILTER (WHERE status = 'DOWN') AS down_sec,
       count(*) FILTER (WHERE status = 'IDLE') AS idle_sec
FROM equipment_sensor_log
WHERE work_order_id IS NOT NULL
  AND recorded_at >= :'t_end'::timestamptz - INTERVAL '7 days' AND recorded_at < :'t_end'::timestamptz
GROUP BY 1;

-- name: status_1h_raw
-- 설비 관리 "최근 60분 상태별 초"(2초마다 호출)
SELECT equipment_id, status, count(*) AS seconds
FROM equipment_sensor_log
WHERE recorded_at >= :'t_end'::timestamptz - INTERVAL '60 minutes' AND recorded_at < :'t_end'::timestamptz
GROUP BY 1, 2;

-- ── After: 같은 조회를 1분 요약(equipment_sensor_minute)에서. 백엔드 SensorMinuteMapper와 같은 모양 ──
-- 요약은 schema.sql을 다시 실행하면 원본 3,024만 행으로 한 번 채워진다(처음 한 번 채우기 SQL)

-- name: oee_today_rollup
SELECT equipment_id, sum(sample_count) AS planned_sec, sum(run_sec + warn_sec) AS run_sec,
       sum(down_sec) AS down_sec, sum(idle_sec) AS idle_sec
FROM equipment_sensor_minute
WHERE work_order_id <> ''
  AND bucket_start >= :'t_end'::timestamptz - INTERVAL '24 hours' AND bucket_start < :'t_end'::timestamptz
GROUP BY 1;

-- name: oee_trend_today_rollup
SELECT equipment_id, date_bin(INTERVAL '1 hour', bucket_start, TIMESTAMPTZ '2000-01-01 00:00:00+09') AS bucket_start,
       sum(sample_count) AS planned_sec, sum(run_sec + warn_sec) AS run_sec,
       sum(down_sec) AS down_sec, sum(idle_sec) AS idle_sec
FROM equipment_sensor_minute
WHERE work_order_id <> ''
  AND bucket_start >= :'t_end'::timestamptz - INTERVAL '24 hours' AND bucket_start < :'t_end'::timestamptz
GROUP BY 1, 2;

-- name: oee_7d_rollup
SELECT equipment_id, sum(sample_count) AS planned_sec, sum(run_sec + warn_sec) AS run_sec,
       sum(down_sec) AS down_sec, sum(idle_sec) AS idle_sec
FROM equipment_sensor_minute
WHERE work_order_id <> ''
  AND bucket_start >= :'t_end'::timestamptz - INTERVAL '7 days' AND bucket_start < :'t_end'::timestamptz
GROUP BY 1;

-- name: status_1h_rollup
SELECT equipment_id, sum(run_sec) AS run_sec, sum(warn_sec) AS warn_sec, sum(down_sec) AS down_sec, sum(idle_sec) AS idle_sec
FROM equipment_sensor_minute
WHERE bucket_start >= :'t_end'::timestamptz - INTERVAL '60 minutes' AND bucket_start < :'t_end'::timestamptz
GROUP BY 1;
