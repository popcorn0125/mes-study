-- 단계별 인덱스 만들기. 앞 단계 인덱스를 모두 지우고 이번 단계 인덱스만 만든 뒤 ANALYZE한다.
--   psql -d mes_bench -v tbl=sensor_log_a -v stage=4 -f backend/sql/bench/02-indexes.sql
--
--   stage 1: 인덱스 없음 (기본 키만)
--   stage 2: equipment_id 단일
--   stage 3: recorded_at DESC 단일
--   stage 4: (equipment_id, recorded_at DESC) 복합
--   stage 5: 복합 + recorded_at DESC 둘 다

\set idx_eq      :tbl '_equipment_idx'
\set idx_time    :tbl '_time_idx'
\set idx_eq_time :tbl '_equipment_time_idx'

DROP INDEX IF EXISTS :"idx_eq", :"idx_time", :"idx_eq_time";

SELECT :stage = 2 AS make_eq, :stage IN (3, 5) AS make_time, :stage IN (4, 5) AS make_eq_time \gset

\if :make_eq
CREATE INDEX :"idx_eq" ON :"tbl" (equipment_id);
\endif
\if :make_time
CREATE INDEX :"idx_time" ON :"tbl" (recorded_at DESC);
\endif
\if :make_eq_time
CREATE INDEX :"idx_eq_time" ON :"tbl" (equipment_id, recorded_at DESC);
\endif

ANALYZE :"tbl";

-- 이번 단계 인덱스 크기(기본 키 제외)
SELECT indexrelid::regclass AS index_name, pg_relation_size(indexrelid) AS bytes
FROM pg_index
WHERE indrelid = :'tbl'::regclass AND NOT indisprimary
ORDER BY 1;
