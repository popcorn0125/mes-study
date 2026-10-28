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

-- 불량 유형: 설비마다 나올 수 있는 유형이 다르다(3단계 품질). 시뮬레이터가 고르는 비중은 시뮬레이터에만 둔다
CREATE TABLE IF NOT EXISTS defect_type (
    defect_code   VARCHAR(50) PRIMARY KEY,
    equipment_id  VARCHAR(50) NOT NULL REFERENCES equipment (equipment_id),
    defect_name   VARCHAR(100) NOT NULL,
    display_order INT NOT NULL,
    -- 실적 쪽 외래 키가 (설비, 유형) 쌍을 걸어 다른 설비의 유형 코드를 막는다
    CONSTRAINT uq_defect_type_equipment UNIQUE (equipment_id, defect_code)
);

INSERT INTO defect_type (defect_code, equipment_id, defect_name, display_order) VALUES
    ('MACHINING_DIMENSION', 'CNC_01', '가공 치수 불량', 1),
    ('MACHINING_SURFACE', 'CNC_01', '가공면 흠집', 2),
    ('WINDING_RESISTANCE', 'WINDER_01', '권선 저항 불량', 3),
    ('WINDING_INSULATION', 'WINDER_01', '절연 불량', 4),
    ('ASSEMBLY_FASTENING', 'ASSEMBLY_01', '조립 체결 불량', 5),
    ('ASSEMBLY_MISSING_PART', 'ASSEMBLY_01', '부품 누락', 6),
    ('INSPECTION_PERFORMANCE', 'INSPECTION_01', '성능 미달', 7),
    ('INSPECTION_NOISE', 'INSPECTION_01', '소음 · 진동 불량', 8),
    ('PACKING_APPEARANCE', 'PACKER_01', '포장 외관 불량', 9),
    ('PACKING_LABEL', 'PACKER_01', '라벨 불량', 10)
ON CONFLICT (defect_code) DO NOTHING;

-- 비가동 사유: 설비가 멈춘 이유. 작업자가 대분류 → 사유로 고른다(비가동 사유 단계)
CREATE TABLE IF NOT EXISTS downtime_reason (
    reason_code   VARCHAR(50) PRIMARY KEY,
    category      VARCHAR(50) NOT NULL,
    reason_name   VARCHAR(100) NOT NULL,
    display_order INT NOT NULL
);

INSERT INTO downtime_reason (reason_code, category, reason_name, display_order) VALUES
    ('BREAKDOWN_MECH', '설비 고장', '기계 고장', 1),
    ('BREAKDOWN_ELEC', '설비 고장', '전기 · 제어 고장', 2),
    ('TOOL_JIG', '설비 고장', '공구 · 지그 문제', 3),
    ('MATERIAL_SHORTAGE', '자재', '자재 결품', 4),
    ('MATERIAL_DEFECT', '자재', '자재 불량', 5),
    ('OPERATOR_ABSENT', '인원', '작업자 부재', 6),
    ('CHANGEOVER', '준비 · 교체', '모델 교체 · 준비', 7),
    ('CLEANING_CHECK', '준비 · 교체', '청소 · 점검', 8),
    ('QUALITY_HOLD', '품질', '품질 확인 대기', 9),
    ('OTHER', '기타', '기타', 10)
ON CONFLICT (reason_code) DO NOTHING;

-- 설비 알람: 시뮬레이터(설비)가 고장 정지에 함께 보내는 코드. 알람마다 자동으로 붙일 사유가 정해져 있다
CREATE TABLE IF NOT EXISTS equipment_alarm (
    alarm_code   VARCHAR(50) PRIMARY KEY,
    equipment_id VARCHAR(50) NOT NULL REFERENCES equipment (equipment_id),
    alarm_name   VARCHAR(100) NOT NULL,
    reason_code  VARCHAR(50) NOT NULL REFERENCES downtime_reason (reason_code),
    -- 정지 쪽 외래 키가 (설비, 알람) 쌍을 걸어 다른 설비의 알람 코드를 막는다
    CONSTRAINT uq_equipment_alarm_equipment UNIQUE (equipment_id, alarm_code)
);

INSERT INTO equipment_alarm (alarm_code, equipment_id, alarm_name, reason_code) VALUES
    ('CNC_SPINDLE_OVERLOAD', 'CNC_01', '스핀들 과부하', 'BREAKDOWN_MECH'),
    ('CNC_TOOL_BREAK', 'CNC_01', '공구 파손', 'TOOL_JIG'),
    ('WINDER_WIRE_BREAK', 'WINDER_01', '선 끊김', 'BREAKDOWN_MECH'),
    ('WINDER_TENSION', 'WINDER_01', '장력 제어 이상', 'BREAKDOWN_ELEC'),
    ('ROBOT_SERVO', 'ASSEMBLY_01', '서보 알람', 'BREAKDOWN_ELEC'),
    ('ROBOT_GRIPPER', 'ASSEMBLY_01', '그리퍼 이상', 'TOOL_JIG'),
    ('INSPECTION_SENSOR', 'INSPECTION_01', '측정 센서 이상', 'BREAKDOWN_ELEC'),
    ('INSPECTION_JIG', 'INSPECTION_01', '검사 지그 이상', 'TOOL_JIG'),
    ('PACKER_JAM', 'PACKER_01', '포장재 걸림', 'BREAKDOWN_MECH'),
    ('PACKER_FILM_EMPTY', 'PACKER_01', '포장재 소진', 'MATERIAL_SHORTAGE')
ON CONFLICT (alarm_code) DO NOTHING;

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

-- 유형별 불량 실적: (작업지시, 설비, 유형)마다 최신 누적 수 한 행. 시뮬레이터가 다시 시작할 때 이어 셀 값이다
CREATE TABLE IF NOT EXISTS production_defect (
    work_order_id   VARCHAR(50) NOT NULL REFERENCES work_order (work_order_id),
    equipment_id    VARCHAR(50) NOT NULL,
    defect_code     VARCHAR(50) NOT NULL,
    defect_count    INT NOT NULL CHECK (defect_count >= 0),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (work_order_id, equipment_id, defect_code),
    FOREIGN KEY (equipment_id, defect_code) REFERENCES defect_type (equipment_id, defect_code)
);

-- 불량 이벤트: 유형별 누적이 늘어날 때마다 늘어난 만큼 한 행. 구간별 유형 수(파레토)를 세는 데 쓴다
CREATE TABLE IF NOT EXISTS defect_event (
    id            BIGSERIAL PRIMARY KEY,
    work_order_id VARCHAR(50) NOT NULL REFERENCES work_order (work_order_id),
    equipment_id  VARCHAR(50) NOT NULL,
    defect_code   VARCHAR(50) NOT NULL,
    occurred_at   TIMESTAMPTZ NOT NULL,
    qty           INT NOT NULL CHECK (qty > 0),
    FOREIGN KEY (equipment_id, defect_code) REFERENCES defect_type (equipment_id, defect_code)
);

CREATE INDEX IF NOT EXISTS defect_event_occurred_at_idx ON defect_event (occurred_at);
CREATE INDEX IF NOT EXISTS defect_event_work_order_idx ON defect_event (work_order_id, occurred_at);

-- 정지(비가동) 한 건: 설비의 DOWN 로그가 5초 안으로 이어지는 동안 한 건. duration_sec = 이어 붙인 DOWN 행 수(= 초).
-- 알람이 있으면 알람의 사유를 자동(AUTO)으로 넣고, 작업자가 넣거나 고치면 MANUAL과 입력자 · 시각이 남는다
CREATE TABLE IF NOT EXISTS downtime (
    id            BIGSERIAL PRIMARY KEY,
    equipment_id  VARCHAR(50) NOT NULL REFERENCES equipment (equipment_id),
    work_order_id VARCHAR(50),
    started_at    TIMESTAMPTZ NOT NULL,
    last_seen_at  TIMESTAMPTZ NOT NULL,
    duration_sec  INT NOT NULL CHECK (duration_sec > 0),
    alarm_code    VARCHAR(50),
    reason_code   VARCHAR(50) REFERENCES downtime_reason (reason_code),
    reason_source VARCHAR(10) CHECK (reason_source IN ('AUTO', 'MANUAL')),
    reason_by     VARCHAR(100),
    reason_at     TIMESTAMPTZ,
    FOREIGN KEY (equipment_id, alarm_code) REFERENCES equipment_alarm (equipment_id, alarm_code)
);

-- 수신: 설비의 마지막 정지 찾기
CREATE INDEX IF NOT EXISTS downtime_equipment_last_seen_idx ON downtime (equipment_id, last_seen_at DESC);
-- 구간 조회: 구간 시작 뒤에 끝난(마지막으로 본) 정지만 읽는다
CREATE INDEX IF NOT EXISTS downtime_last_seen_at_idx ON downtime (last_seen_at);

-- 대시보드 조회용 인덱스. 최신 1건 · 최근 n분 추이 · 상태 비율 · 상태 변경 이력이 모두 "최근 시간 범위"를 읽는다.
-- 설비 5대 기준 실험에서 recorded_at 단일이 조회 4개를 모두 5ms 안에 끝냈고, 복합 인덱스보다 3배 작았다
-- (복합은 설비 조건이 없는 상태 비율 조회에 쓰이지 않는다). 근거: docs/experiments/sensor-log-index/README.md
CREATE INDEX IF NOT EXISTS equipment_sensor_log_recorded_at_idx ON equipment_sensor_log (recorded_at DESC);
