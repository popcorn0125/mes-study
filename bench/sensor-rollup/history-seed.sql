-- 조회 비교용 데이터: 설비 50대 × 7일 × 1초 = 30,240,000행 (측정 전용 DB mes_bench_query에서 실행한다)
--   psql -d mes_bench_query -f backend/src/main/resources/schema.sql   (실제 스키마를 먼저 만든다)
--   psql -d mes_bench_query -f bench/sensor-rollup/history-seed.sql   (약 3~5분)
-- 실제 수신처럼 "1초에 설비 수만큼" 시간순으로 넣는다. 마지막 시각은 고정이라 다시 만들어도 같은 데이터가 나온다.
-- 상태는 설비 · 2분 구간마다 정한다(RUN 85% · IDLE 7% · WARN 5% · DOWN 3%). 모든 행이 작업지시 하나에 속한다(OEE 계획 시간)
\set t_end '\'2026-10-28 00:00:00+09\''

TRUNCATE equipment_sensor_log RESTART IDENTITY;
SELECT setseed(0.42);

INSERT INTO equipment_sensor_log (equipment_id, recorded_at, status, work_order_id, temperature, vibration)
SELECT
    'BENCH_' || lpad(e::text, 3, '0'),
    t,
    s.status,
    'WO-BENCH',
    round((CASE s.status WHEN 'WARN' THEN 78 WHEN 'IDLE' THEN 40 ELSE 60 END + random() * 10)::numeric, 2),
    round((CASE s.status WHEN 'WARN' THEN 4 ELSE 1 END + random())::numeric, 2)
FROM generate_series(:t_end::timestamptz - INTERVAL '7 days', :t_end::timestamptz - INTERVAL '1 second', INTERVAL '1 second') t
CROSS JOIN generate_series(1, 50) e
CROSS JOIN LATERAL (
    SELECT CASE
        WHEN p < 85 THEN 'RUN' WHEN p < 92 THEN 'IDLE' WHEN p < 97 THEN 'WARN' ELSE 'DOWN' END AS status
    FROM (SELECT abs(hashint8(e * 100000 + (extract(epoch FROM t)::bigint / 120))) % 100 AS p) h
) s
ORDER BY t, e;

VACUUM ANALYZE equipment_sensor_log;
SELECT count(*) AS rows, pg_size_pretty(pg_relation_size('equipment_sensor_log')) AS heap,
       pg_size_pretty(pg_indexes_size('equipment_sensor_log')) AS indexes
FROM equipment_sensor_log;
