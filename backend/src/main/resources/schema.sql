-- ── 기준정보 ─────────────────────────────────────────────

-- 품목: 라인에서 만드는 제품
CREATE TABLE IF NOT EXISTS item (
    item_code  VARCHAR(50) PRIMARY KEY,
    item_name  VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 설비: 라인 순서대로 놓인 설비. 기준 택트는 2단계 OEE 성능 계산의 기준이 된다(시뮬레이터의 실제 택트와 다를 수 있다)
CREATE TABLE IF NOT EXISTS equipment (
    equipment_id      VARCHAR(50) PRIMARY KEY,
    equipment_name    VARCHAR(100) NOT NULL,
    work_center_name  VARCHAR(100) NOT NULL,
    line_order        INT NOT NULL UNIQUE,
    standard_tact_sec INT NOT NULL CHECK (standard_tact_sec > 0)
);

INSERT INTO item (item_code, item_name) VALUES
    ('MOTOR_A', 'BLDC 모터 표준형 A'),
    ('MOTOR_B', 'BLDC 모터 고출력형 B')
ON CONFLICT (item_code) DO NOTHING;

INSERT INTO equipment (equipment_id, equipment_name, work_center_name, line_order, standard_tact_sec) VALUES
    ('CNC_01', 'CNC #1', '하우징 가공', 1, 45),
    ('WINDER_01', '권선기 #1', '스테이터 권선', 2, 40),
    ('ASSEMBLY_01', '조립 셀 #1', '조립', 3, 50),
    ('INSPECTION_01', '검사기 #1', '검사', 4, 30),
    ('PACKER_01', '포장기 #1', '포장', 5, 25)
ON CONFLICT (equipment_id) DO NOTHING;

-- ── 작업지시 ─────────────────────────────────────────────

-- 작업지시: PLANNED(계획) → RELEASED(하달) → IN_PROGRESS(진행) → COMPLETED(완료), HELD(보류)
CREATE TABLE IF NOT EXISTS work_order (
    work_order_id VARCHAR(50) PRIMARY KEY,
    item_code     VARCHAR(50) NOT NULL REFERENCES item (item_code),
    planned_qty   INT NOT NULL CHECK (planned_qty > 0),
    status        VARCHAR(20) NOT NULL DEFAULT 'PLANNED'
                  CHECK (status IN ('PLANNED', 'RELEASED', 'IN_PROGRESS', 'HELD', 'COMPLETED')),
    priority      INT NOT NULL DEFAULT 5 CHECK (priority BETWEEN 0 AND 9),
    due_at        TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    released_at   TIMESTAMPTZ,
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ
);

-- 라인 하나는 한 번에 작업지시 하나만 생산한다: 진행 중(IN_PROGRESS)은 최대 1건
CREATE UNIQUE INDEX IF NOT EXISTS work_order_one_in_progress_idx ON work_order ((true)) WHERE status = 'IN_PROGRESS';
-- 라인이 비면 하달된 지시 중 우선순위 높은 순 → 하달 빠른 순으로 고른다
CREATE INDEX IF NOT EXISTS work_order_dispatch_idx ON work_order (status, priority DESC, released_at);

-- 시뮬레이터 실행: 마지막에 시작한 시뮬레이터(run_id) 하나만 데이터를 보낼 수 있다. 행은 늘 1개(id = 1)
CREATE TABLE IF NOT EXISTS producer_run (
    id         SMALLINT PRIMARY KEY CHECK (id = 1),
    run_id     UUID NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── 수신 데이터 ───────────────────────────────────────────

-- 장비 센서 시계열 로그: 1초마다 계속 쌓인다. status: RUN 가동 · WARN 경고 · DOWN 고장 · IDLE 대기
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
-- (외래 키는 2026-10 작업지시 추가 때 넣었다. 그 전에 만든 DB는 이 테이블을 지우고 다시 만들어야 외래 키가 생긴다)
CREATE TABLE IF NOT EXISTS production_performance (
    id              BIGSERIAL PRIMARY KEY,
    work_order_id   VARCHAR(50) NOT NULL REFERENCES work_order (work_order_id),
    equipment_id    VARCHAR(50) NOT NULL REFERENCES equipment (equipment_id),
    total_count     INT DEFAULT 0,
    good_count      INT DEFAULT 0,
    bad_count       INT DEFAULT 0,
    last_updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_work_equipment UNIQUE (work_order_id, equipment_id)
);

-- 센서 로그를 받을 때 진행 중이던 작업지시(없으면 NULL). OEE의 계획 가동 시간 = 작업지시가 있던 초.
-- 2026-10 OEE 때 추가했다. 기존 DB도 서버를 다시 켜면 열이 생기고, 그 전 로그는 NULL이라 계획 가동 시간에서 빠진다.
-- 1초마다 쌓이는 테이블이라 외래 키는 걸지 않는다
ALTER TABLE equipment_sensor_log ADD COLUMN IF NOT EXISTS work_order_id VARCHAR(50);

-- 생산 이벤트: 실적(누적값)이 늘어날 때마다 늘어난 만큼 한 행. 구간(오늘 · 최근 n시간 · 시간대별) 생산 수를 세는 데 쓴다
CREATE TABLE IF NOT EXISTS production_event (
    id            BIGSERIAL PRIMARY KEY,
    work_order_id VARCHAR(50) NOT NULL REFERENCES work_order (work_order_id),
    equipment_id  VARCHAR(50) NOT NULL REFERENCES equipment (equipment_id),
    occurred_at   TIMESTAMPTZ NOT NULL,
    good_qty      INT NOT NULL CHECK (good_qty >= 0),
    bad_qty       INT NOT NULL CHECK (bad_qty >= 0)
);

CREATE INDEX IF NOT EXISTS production_event_occurred_at_idx ON production_event (occurred_at);
CREATE INDEX IF NOT EXISTS production_event_work_order_idx ON production_event (work_order_id, occurred_at);

-- 대시보드 조회용 인덱스. 최신 1건 · 최근 n분 추이 · 상태 비율 · 상태 변경 이력이 모두 "최근 시간 범위"를 읽는다.
-- 설비 5대 기준 실험에서 recorded_at 단일이 조회 4개를 모두 5ms 안에 끝냈고, 복합 인덱스보다 3배 작았다
-- (복합은 설비 조건이 없는 상태 비율 조회에 쓰이지 않는다). 근거: docs/experiments/sensor-log-index/README.md
CREATE INDEX IF NOT EXISTS equipment_sensor_log_recorded_at_idx ON equipment_sensor_log (recorded_at DESC);
