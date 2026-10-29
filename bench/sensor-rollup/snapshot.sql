-- 누적 카운터 한 줄(CSV). 측정 전후 두 번 찍어 차이를 본다.
-- minute_* · change_*: After의 1분 요약 · 상태 이력(Before에는 테이블이 없어 0). writes = 넣은 행 + 고친 행(UPSERT 합치기)
SELECT
    extract(epoch FROM clock_timestamp())::numeric(16, 3)       AS epoch,
    d.tup_inserted,
    d.tup_updated,
    d.xact_commit,
    w.wal_records,
    w.wal_bytes,
    w.wal_fpi,
    w.wal_write,
    w.wal_sync,
    (SELECT count(*) FROM equipment_sensor_log)                  AS sensor_rows,
    pg_relation_size('equipment_sensor_log')                     AS sensor_table_bytes,
    pg_indexes_size('equipment_sensor_log')                      AS sensor_index_bytes,
    pg_total_relation_size('equipment_sensor_log')               AS sensor_total_bytes,
    COALESCE((SELECT n_tup_ins + n_tup_upd FROM pg_stat_user_tables WHERE relname = 'equipment_sensor_minute'), 0) AS minute_writes,
    COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'equipment_sensor_minute'), 0)            AS minute_rows,
    COALESCE(pg_total_relation_size(to_regclass('equipment_sensor_minute')), 0)                                   AS minute_total_bytes,
    COALESCE((SELECT n_tup_ins + n_tup_upd FROM pg_stat_user_tables WHERE relname = 'equipment_status_change'), 0) AS change_writes,
    COALESCE(pg_total_relation_size(to_regclass('equipment_status_change')), 0)                                   AS change_total_bytes
FROM pg_stat_database d, pg_stat_wal w
WHERE d.datname = current_database();
