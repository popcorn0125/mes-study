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

-- 대시보드 조회용 인덱스. 최신 1건 · 최근 n분 추이 · 상태 비율 · 상태 변경 이력이 모두 "최근 시간 범위"를 읽는다.
-- 설비 5대 기준 실험에서 recorded_at 단일이 조회 4개를 모두 5ms 안에 끝냈고, 복합 인덱스보다 3배 작았다
-- (복합은 설비 조건이 없는 상태 비율 조회에 쓰이지 않는다). 근거: docs/experiments/sensor-log-index/README.md
CREATE INDEX IF NOT EXISTS equipment_sensor_log_recorded_at_idx ON equipment_sensor_log (recorded_at DESC);
