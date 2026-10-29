-- 정확도: 같은 3,024만 행에서 원본을 센 OEE 초와 1분 요약을 더한 OEE 초가 설비마다 같은가(다른 설비 수 = 0이어야 한다)
--   psql -d mes_bench_query -v t_end="'2026-10-28 00:00:00+09'" -f bench/sensor-rollup/history-accuracy.sql
WITH raw AS (
    SELECT equipment_id, count(*) AS planned, count(*) FILTER (WHERE status IN ('RUN', 'WARN')) AS run,
           count(*) FILTER (WHERE status = 'DOWN') AS down, count(*) FILTER (WHERE status = 'IDLE') AS idle
    FROM equipment_sensor_log
    WHERE work_order_id IS NOT NULL
      AND recorded_at >= :t_end::timestamptz - INTERVAL '7 days' AND recorded_at < :t_end::timestamptz
    GROUP BY 1
), rollup AS (
    SELECT equipment_id, sum(sample_count) AS planned, sum(run_sec + warn_sec) AS run, sum(down_sec) AS down, sum(idle_sec) AS idle
    FROM equipment_sensor_minute
    WHERE work_order_id <> ''
      AND bucket_start >= :t_end::timestamptz - INTERVAL '7 days' AND bucket_start < :t_end::timestamptz
    GROUP BY 1
)
SELECT count(*) AS equipment,
       count(*) FILTER (WHERE (r.planned, r.run, r.down, r.idle) IS DISTINCT FROM (m.planned, m.run, m.down, m.idle)) AS different,
       sum(r.planned) AS raw_planned_sec, sum(m.planned) AS rollup_planned_sec,
       sum(r.down) AS raw_down_sec, sum(m.down) AS rollup_down_sec
FROM raw r FULL JOIN rollup m USING (equipment_id);
