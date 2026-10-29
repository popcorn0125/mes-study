package com.messtudy.backend;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.stream.Stream;

import org.springframework.jdbc.core.JdbcTemplate;

import com.messtudy.backend.service.SensorAggregator;

/**
 * DB 테스트 공통 준비. 기준정보(품목 · 설비)는 schema.sql이 넣은 그대로 두고, 쌓이는 데이터만 비운다.
 * 센서 값은 DB가 아니라 메모리(SensorAggregator) · 스풀 파일에도 남으므로 함께 비운다.
 */
public final class TestDb {

    /** 실적 테스트들이 쓰는 작업지시 번호 */
    public static final String WORK_ORDER_ID = "WO-20261024-001";

    /** application-test.properties의 mes.sensor.spool-dir · archive-dir가 들어 있는 폴더 */
    public static final Path SENSOR_DIR = Path.of("build/test-sensor");

    private TestDb() {
    }

    /** 작업지시 · 실적(수량 · 불량 유형) · 이벤트 · 센서 요약 · 상태 이력 · 정지 · 시뮬레이터 실행과 센서 메모리 · 스풀을 비운다 */
    public static void reset(JdbcTemplate jdbc, SensorAggregator aggregator) {
        jdbc.execute("TRUNCATE equipment_sensor_log, equipment_sensor_minute, equipment_status_change, downtime, defect_event, "
                + "production_defect, production_event, production_performance, work_order, producer_run RESTART IDENTITY");
        aggregator.clear();
        deleteSensorFiles();
    }

    /** 비운 뒤 실적이 참조할 작업지시(WORK_ORDER_ID, 진행 중) 하나를 넣는다 */
    public static void resetWithWorkOrder(JdbcTemplate jdbc, SensorAggregator aggregator) {
        reset(jdbc, aggregator);
        jdbc.update("INSERT INTO work_order (work_order_id, item_code, planned_qty, status) VALUES (?, 'MOTOR_A', 100, 'IN_PROGRESS')",
                WORK_ORDER_ID);
    }

    private static void deleteSensorFiles() {
        if (!Files.exists(SENSOR_DIR)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(SENSOR_DIR)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.delete(path);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
