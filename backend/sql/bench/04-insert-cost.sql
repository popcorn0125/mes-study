-- INSERT 비용 측정: 실제 수신 API처럼 "5행 다중 INSERT"를 1,000번 하고 걸린 시간(ms)을 잰다.
-- 데이터가 남지 않게 트랜잭션을 ROLLBACK하고, 남은 dead tuple은 VACUUM으로 치운다.
--   psql -d mes_bench -v tbl=sensor_log_a -v eqtbl=equipment_a -v t_end='2026-10-24 00:00:00+09' -f backend/sql/bench/04-insert-cost.sql

CREATE OR REPLACE FUNCTION bench_insert(tbl regclass, eqtbl regclass, t_end timestamptz, n int DEFAULT 1000)
RETURNS numeric
LANGUAGE plpgsql AS $$
DECLARE
    ids     text[];
    started timestamptz;
BEGIN
    EXECUTE format('SELECT array_agg(equipment_id ORDER BY equipment_id) FROM (SELECT equipment_id FROM %s ORDER BY equipment_id LIMIT 5) e', eqtbl)
        INTO ids;
    started := clock_timestamp();
    FOR i IN 1..n LOOP
        -- 1초치 5행. 시각은 기존 데이터 뒤(t_end + i초)라 실제처럼 인덱스의 "최신 끝"에 붙는다.
        EXECUTE format('INSERT INTO %s (equipment_id, recorded_at, status, temperature, vibration) VALUES '
                       '($1, $6, ''RUN'', 40.00, 1.20), ($2, $6, ''RUN'', 40.00, 1.20), ($3, $6, ''RUN'', 40.00, 1.20), '
                       '($4, $6, ''RUN'', 40.00, 1.20), ($5, $6, ''RUN'', 40.00, 1.20)', tbl)
            USING ids[1], ids[2], ids[3], ids[4], ids[5], t_end + make_interval(secs => i);
    END LOOP;
    RETURN round(EXTRACT(EPOCH FROM clock_timestamp() - started)::numeric * 1000, 1);
END;
$$;

BEGIN;
SELECT bench_insert(:'tbl', :'eqtbl', :'t_end') AS insert_ms;
ROLLBACK;
BEGIN;
SELECT bench_insert(:'tbl', :'eqtbl', :'t_end') AS insert_ms;
ROLLBACK;
BEGIN;
SELECT bench_insert(:'tbl', :'eqtbl', :'t_end') AS insert_ms;
ROLLBACK;

VACUUM :"tbl";
