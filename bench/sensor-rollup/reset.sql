-- 시나리오마다 수신 데이터를 비우고 시작한다(기준정보는 그대로).
-- 1분 요약 · 상태 이력 테이블은 After(바꾼 뒤) 백엔드가 만든다. Before 백엔드에서는 없으므로 있을 때만 비운다
TRUNCATE equipment_sensor_log, downtime RESTART IDENTITY;
DO $$
BEGIN
    IF to_regclass('equipment_sensor_minute') IS NOT NULL THEN
        TRUNCATE equipment_sensor_minute, equipment_status_change RESTART IDENTITY;
    END IF;
END $$;
CHECKPOINT;
