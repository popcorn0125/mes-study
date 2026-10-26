-- 측정 쿼리. 대시보드 조회 API(SensorLogQueryMapper.xml)와 같은 모양이고, "지금" 대신 데이터의 마지막 시각(t_end)을 쓴다.
-- run.sh가 "-- name:" 줄로 쿼리를 나눠 각각 앞에 EXPLAIN (ANALYZE, BUFFERS)를 붙여 실행한다.
-- 변수: tbl(센서 로그 테이블) · eqtbl(설비 목록 테이블) · eq(한 설비 조회 대상) · t_end(기준 시각)

-- name: Q1_distinct_on
-- 설비별 최신 1건: DISTINCT ON 형태(설비 목록 없이 로그 테이블만으로)
SELECT DISTINCT ON (equipment_id) equipment_id, recorded_at, status, temperature, vibration
FROM :"tbl"
ORDER BY equipment_id, recorded_at DESC;

-- name: Q1_lateral
-- 설비별 최신 1건: LATERAL 형태(설비마다 최근 1건만 찾는다. 현재 API가 쓰는 형태)
SELECT l.equipment_id, l.recorded_at, l.status, l.temperature, l.vibration
FROM :"eqtbl" e
CROSS JOIN LATERAL (
    SELECT s.equipment_id, s.recorded_at, s.status, s.temperature, s.vibration
    FROM :"tbl" s
    WHERE s.equipment_id = e.equipment_id
    ORDER BY s.recorded_at DESC
    LIMIT 1
) l
ORDER BY l.equipment_id;

-- name: Q2_recent_logs
-- 한 설비의 최근 10분 추이
SELECT recorded_at, status, temperature, vibration
FROM :"tbl"
WHERE equipment_id = :'eq'
  AND recorded_at >= :'t_end'::timestamptz - INTERVAL '10 minutes'
ORDER BY recorded_at;

-- name: Q3_status_summary
-- 전체 설비의 최근 1시간 상태별 초
SELECT equipment_id, status, count(*) AS seconds
FROM :"tbl"
WHERE recorded_at >= :'t_end'::timestamptz - INTERVAL '60 minutes'
GROUP BY equipment_id, status
ORDER BY equipment_id, status;

-- name: Q4_status_changes
-- 한 설비의 최근 1시간 상태 변경 이력(LAG로 바뀐 지점을 찾고 LEAD로 구간 끝을 붙인다)
WITH logs AS (
    SELECT recorded_at, status, LAG(status) OVER (ORDER BY recorded_at) AS prev_status
    FROM :"tbl"
    WHERE equipment_id = :'eq'
      AND recorded_at >= :'t_end'::timestamptz - INTERVAL '60 minutes'
),
changes AS (
    SELECT status, recorded_at AS started_at, LEAD(recorded_at) OVER (ORDER BY recorded_at) AS ended_at
    FROM logs
    WHERE prev_status IS DISTINCT FROM status
)
SELECT c.status, c.started_at, c.ended_at,
       round(EXTRACT(EPOCH FROM (COALESCE(c.ended_at, (SELECT max(recorded_at) FROM logs) + INTERVAL '1 second') - c.started_at)))::int AS seconds
FROM changes c
ORDER BY c.started_at DESC;
