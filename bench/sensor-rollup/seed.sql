-- 부하 측정용 설비 BENCH_001 ~ BENCH_2000 (측정 전용 DB mes_bench_ingest에서 실행한다)
-- 정지 추적(downtime)이 설비 외래 키를 보므로 설비가 기준정보에 있어야 한다. 라인 순서는 실제 설비(1~5)와 겹치지 않게 1001부터
INSERT INTO equipment (equipment_id, equipment_name, work_center_name, line_order, standard_tact_sec)
SELECT 'BENCH_' || lpad(n::text, 3, '0'), '부하 설비 #' || n, '부하 측정', 1000 + n, 30
FROM generate_series(1, 2000) n
ON CONFLICT (equipment_id) DO NOTHING;
