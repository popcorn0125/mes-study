package com.messtudy.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** 테스트 DB(mes_test)에서 두 테이블 저장과 트랜잭션 롤백을 확인한다. */
@SpringBootTest
@ActiveProfiles("test")
class SensorLogServiceDbTest {

    @Autowired
    private SensorLogService service;

    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        jdbc.execute("TRUNCATE equipment_sensor_log, production_performance RESTART IDENTITY");
    }

    private static Map<String, Object> item(String workOrderId, String equipmentId, int totalCount) {
        return Map.of(
                "equipmentId", equipmentId,
                "timestamp", "2026-10-24T23:37:12.451Z",
                "status", "RUN",
                "workOrderId", workOrderId,
                "metrics", Map.of("temperature", 49.4, "vibration", 2.8),
                "production", Map.of("totalCount", totalCount, "goodCount", totalCount, "badCount", 0));
    }

    private int count(String table) {
        return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
    }

    @Test
    void 매초_요청이_오면_센서_로그는_쌓이고_실적은_한_행이_갱신된다() {
        for (int second = 1; second <= 3; second++) {
            service.save(List.of(item("WO-20261024-001", "CNC_01", second), item("WO-20261024-001", "WINDER_01", second)));
        }

        assertThat(count("equipment_sensor_log")).isEqualTo(6);
        assertThat(count("production_performance")).isEqualTo(2);
        assertThat(jdbc.queryForObject(
                "SELECT total_count FROM production_performance WHERE equipment_id = 'CNC_01'", Integer.class)).isEqualTo(3);
    }

    @Test
    void 실적_저장이_실패하면_센서_로그도_저장되지_않는다() {
        String tooLong = "W".repeat(51); // work_order_id VARCHAR(50) 초과 → 센서 로그를 넣은 뒤 실적 저장에서 실패

        assertThatThrownBy(() -> service.save(List.of(item(tooLong, "CNC_01", 1))))
                .isInstanceOf(DataIntegrityViolationException.class);

        assertThat(count("equipment_sensor_log")).isZero();
        assertThat(count("production_performance")).isZero();
    }
}
