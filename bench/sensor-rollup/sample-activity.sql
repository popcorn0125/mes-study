-- 1초마다 찍는 연결 상태(CSV): 이 DB의 활성 연결 수와 그중 잠금(advisory)을 기다리는 수
SELECT
    extract(epoch FROM clock_timestamp())::numeric(16, 3),
    count(*) FILTER (WHERE state = 'active'),
    count(*) FILTER (WHERE wait_event_type = 'Lock' AND wait_event = 'advisory'),
    count(*) FILTER (WHERE wait_event_type = 'IO'),
    count(*) FILTER (WHERE wait_event_type = 'LWLock')
FROM pg_stat_activity
WHERE datname = current_database() AND pid <> pg_backend_pid();
