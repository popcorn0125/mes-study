-- 장비 센서 시계열 로그: 1초마다 계속 쌓인다
CREATE TABLE IF NOT EXISTS equipment_sensor_log (
    id           BIGSERIAL PRIMARY KEY,
    equipment_id VARCHAR(50) NOT NULL,
    recorded_at  TIMESTAMPTZ NOT NULL,
    status       VARCHAR(20) NOT NULL,
    temperature  NUMERIC(5, 2),
    vibration    NUMERIC(5, 2),
    created_at   TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 작업 실적: 작업지시 · 장비마다 한 행을 두고 최신 누적 수량으로 갱신한다
CREATE TABLE IF NOT EXISTS production_performance (
    id              BIGSERIAL PRIMARY KEY,
    work_order_id   VARCHAR(50) NOT NULL,
    equipment_id    VARCHAR(50) NOT NULL,
    total_count     INT DEFAULT 0,
    good_count      INT DEFAULT 0,
    bad_count       INT DEFAULT 0,
    last_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_work_equipment UNIQUE (work_order_id, equipment_id)
);
