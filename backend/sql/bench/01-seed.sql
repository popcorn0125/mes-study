-- 인덱스 비교 실험용 데이터 생성 (실험 전용 DB mes_bench에서 실행한다)
--   psql -d mes_bench -f backend/sql/bench/01-seed.sql
--
-- 전체 행 수는 같게(약 302만) 두고 설비 수만 바꾼 데이터셋 두 개를 만든다.
--   A: 설비 5대  × 7일(604,800초)        = 3,024,000행  ← 실제 대시보드와 같은 설비 수
--   B: 설비 50대 × 16.8시간(60,480초)    = 3,024,000행  ← 설비 수(선택도)만 다르게
-- 실제 수신 API처럼 "1초에 설비 수만큼" 시간순으로 넣어서, 테이블 안의 물리적인 순서도 시간순이 되게 한다.
-- 마지막 시각은 고정('2026-10-24 00:00:00+09')이라 언제 다시 만들어도 같은 데이터가 나온다.

DROP TABLE IF EXISTS sensor_log_a, sensor_log_b, equipment_a, equipment_b;

-- 실제 테이블(equipment_sensor_log)과 같은 열 구성
CREATE TABLE sensor_log_a (
    id           BIGSERIAL PRIMARY KEY,
    equipment_id VARCHAR(50) NOT NULL,
    recorded_at  TIMESTAMPTZ NOT NULL,
    status       VARCHAR(20) NOT NULL,
    temperature  NUMERIC(5, 2),
    vibration    NUMERIC(5, 2),
    created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE sensor_log_b (
    id           BIGSERIAL PRIMARY KEY,
    equipment_id VARCHAR(50) NOT NULL,
    recorded_at  TIMESTAMPTZ NOT NULL,
    status       VARCHAR(20) NOT NULL,
    temperature  NUMERIC(5, 2),
    vibration    NUMERIC(5, 2),
    created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 설비 목록(최신 1건 조회의 LATERAL 형태가 돌 목록. 실제 API에서는 production_performance가 이 역할)
CREATE TABLE equipment_a (equipment_id VARCHAR(50) PRIMARY KEY);
CREATE TABLE equipment_b (equipment_id VARCHAR(50) PRIMARY KEY);
INSERT INTO equipment_a VALUES ('ASSEMBLY_01'), ('CNC_01'), ('INSPECTION_01'), ('PACKER_01'), ('WINDER_01');
INSERT INTO equipment_b SELECT 'EQ_' || lpad(n::text, 2, '0') FROM generate_series(1, 50) n;

-- 상태는 매초 무작위가 아니라 2분 단위 구간으로 정해서 실제처럼 한동안 유지되게 한다
-- (RUN 85% · IDLE 7% · WARN 5% · DOWN 3%). 온도 · 진동은 매초 무작위.
SELECT setseed(0.42);

INSERT INTO sensor_log_a (equipment_id, recorded_at, status, temperature, vibration)
SELECT e.equipment_id,
       t.at,
       CASE WHEN h < 85 THEN 'RUN' WHEN h < 92 THEN 'IDLE' WHEN h < 97 THEN 'WARN' ELSE 'DOWN' END,
       round((30 + random() * 30)::numeric, 2),
       round((1 + random() * 3)::numeric, 2)
FROM generate_series(timestamptz '2026-10-24 00:00:00+09' - interval '604799 seconds',
                     timestamptz '2026-10-24 00:00:00+09', interval '1 second') AS t(at)
CROSS JOIN equipment_a e
CROSS JOIN LATERAL (SELECT abs(hashtext(e.equipment_id || floor(extract(epoch FROM t.at) / 120)::text)) % 100 AS h) s
ORDER BY t.at, e.equipment_id;

INSERT INTO sensor_log_b (equipment_id, recorded_at, status, temperature, vibration)
SELECT e.equipment_id,
       t.at,
       CASE WHEN h < 85 THEN 'RUN' WHEN h < 92 THEN 'IDLE' WHEN h < 97 THEN 'WARN' ELSE 'DOWN' END,
       round((30 + random() * 30)::numeric, 2),
       round((1 + random() * 3)::numeric, 2)
FROM generate_series(timestamptz '2026-10-24 00:00:00+09' - interval '60479 seconds',
                     timestamptz '2026-10-24 00:00:00+09', interval '1 second') AS t(at)
CROSS JOIN equipment_b e
CROSS JOIN LATERAL (SELECT abs(hashtext(e.equipment_id || floor(extract(epoch FROM t.at) / 120)::text)) % 100 AS h) s
ORDER BY t.at, e.equipment_id;

-- 통계 갱신 + visibility map 정리(Index Only Scan 판단에 쓰인다)
VACUUM ANALYZE sensor_log_a;
VACUUM ANALYZE sensor_log_b;
VACUUM ANALYZE equipment_a;
VACUUM ANALYZE equipment_b;

SELECT 'A' AS dataset, count(*) AS rows, count(DISTINCT equipment_id) AS equipment,
       min(recorded_at) AS first_at, max(recorded_at) AS last_at,
       pg_size_pretty(pg_relation_size('sensor_log_a')) AS table_size
FROM sensor_log_a
UNION ALL
SELECT 'B', count(*), count(DISTINCT equipment_id), min(recorded_at), max(recorded_at),
       pg_size_pretty(pg_relation_size('sensor_log_b'))
FROM sensor_log_b;
