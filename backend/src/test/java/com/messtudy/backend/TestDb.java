package com.messtudy.backend;

import org.springframework.jdbc.core.JdbcTemplate;

/** DB 테스트 공통 준비. 기준정보(품목 · 설비)는 schema.sql이 넣은 그대로 두고, 쌓이는 데이터만 비운다. */
public final class TestDb {

    /** 실적 테스트들이 쓰는 작업지시 번호 */
    public static final String WORK_ORDER_ID = "WO-20261024-001";

    private TestDb() {
    }

    /** 작업지시 · 실적 · 센서 로그 · 시뮬레이터 실행을 비운다 */
    public static void reset(JdbcTemplate jdbc) {
        jdbc.execute("TRUNCATE equipment_sensor_log, production_event, production_performance, work_order, producer_run RESTART IDENTITY");
    }

    /** 비운 뒤 실적이 참조할 작업지시(WORK_ORDER_ID, 진행 중) 하나를 넣는다 */
    public static void resetWithWorkOrder(JdbcTemplate jdbc) {
        reset(jdbc);
        jdbc.update("INSERT INTO work_order (work_order_id, item_code, planned_qty, status) VALUES (?, 'MOTOR_A', 100, 'IN_PROGRESS')",
                WORK_ORDER_ID);
    }
}
