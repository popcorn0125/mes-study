package com.messtudy.backend.mapper;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** 테스트 DB(mes_test)에 로그를 넣고 조회 SQL 결과를 확인한다. 시각은 모두 DB 현재 시각 기준 "n초 전"으로 넣는다. */
@SpringBootTest
@ActiveProfiles("test")
class QueryMapperDbTest {

    @Autowired
    private SensorLogQueryMapper sensorLogQueryMapper;

    @Autowired
    private ProductionQueryMapper productionQueryMapper;

    @Autowired
    private JdbcTemplate jdbc;

    /** 테스트 데이터의 기준 시각(DB의 now()) */
    private OffsetDateTime now;

    @BeforeEach
    void clean() {
        jdbc.execute("TRUNCATE equipment_sensor_log, production_performance RESTART IDENTITY");
        now = jdbc.queryForObject("SELECT now()", OffsetDateTime.class);
    }

    /** 센서 로그 한 행을 secondsAgo초 전 시각으로 넣는다. */
    private void log(String equipmentId, int secondsAgo, String status, String temperature) {
        jdbc.update("INSERT INTO equipment_sensor_log (equipment_id, recorded_at, status, temperature, vibration) VALUES (?, ?, ?, ?, ?)",
                equipmentId, now.minusSeconds(secondsAgo), status,
                temperature == null ? null : new BigDecimal(temperature), new BigDecimal("1.20"));
    }

    /** 실적 한 행을 넣는다(최신 1건 조회의 장비 목록이 된다). */
    private void production(String equipmentId, int total) {
        jdbc.update("INSERT INTO production_performance (work_order_id, equipment_id, total_count, good_count, bad_count) VALUES (?, ?, ?, ?, 0)",
                "WO-20261024-001", equipmentId, total, total);
    }

    @Test
    void 장비마다_가장_최근_로그_1건을_고른다() {
        production("CNC_01", 3);
        production("WINDER_01", 2);
        log("CNC_01", 3, "RUN", "40.0");
        log("CNC_01", 1, "WARN", null); // 가장 최근 · 온도 없음
        log("WINDER_01", 2, "RUN", "38.5");

        List<Map<String, Object>> rows = sensorLogQueryMapper.findLatestPerEquipment();

        assertThat(rows).extracting(r -> r.get("equipmentId")).containsExactly("CNC_01", "WINDER_01");
        assertThat(rows.get(0)).containsEntry("status", "WARN").containsEntry("temperature", null);
        assertThat(rows.get(0).get("recordedAt")).isNotNull();
        assertThat((BigDecimal) rows.get(1).get("temperature")).isEqualByComparingTo("38.5");
    }

    @Test
    void 장비_하나의_최근_n분_로그를_시간순으로_돌려준다() {
        log("CNC_01", 11 * 60, "RUN", "30.0"); // 10분 밖
        log("CNC_01", 30, "RUN", "41.0");
        log("CNC_01", 10, "DOWN", "42.0");
        log("WINDER_01", 20, "RUN", "50.0"); // 다른 장비

        List<Map<String, Object>> rows = sensorLogQueryMapper.findRecentLogs("CNC_01", 10);

        assertThat(rows).extracting(r -> r.get("status")).containsExactly("RUN", "DOWN");
        assertThat(rows.get(0).keySet()).containsExactlyInAnyOrder("recordedAt", "status", "temperature", "vibration");
    }

    @Test
    void 최근_n분_동안_장비_상태별_초를_센다() {
        for (int s = 1; s <= 3; s++) {
            log("CNC_01", s, "RUN", "40.0");
        }
        log("CNC_01", 4, "DOWN", "40.0");
        log("WINDER_01", 1, "RUN", "40.0");
        log("WINDER_01", 2 * 60 * 60, "DOWN", "40.0"); // 60분 밖

        List<Map<String, Object>> rows = sensorLogQueryMapper.countStatusSeconds(60);

        assertThat(rows).containsExactly(
                Map.of("equipmentId", "CNC_01", "status", "DOWN", "seconds", 1L),
                Map.of("equipmentId", "CNC_01", "status", "RUN", "seconds", 3L),
                Map.of("equipmentId", "WINDER_01", "status", "RUN", "seconds", 1L));
    }

    @Test
    void 상태가_바뀐_구간을_최신부터_돌려준다() {
        // 7초 전부터 1초 전까지: RUN 3초 → WARN 2초 → RUN 2초(진행 중)
        String[] statuses = {"RUN", "RUN", "RUN", "WARN", "WARN", "RUN", "RUN"};
        for (int i = 0; i < statuses.length; i++) {
            log("CNC_01", 7 - i, statuses[i], "40.0");
        }
        log("WINDER_01", 3, "DOWN", "40.0"); // 다른 장비는 섞이지 않는다

        List<Map<String, Object>> rows = sensorLogQueryMapper.findStatusChanges("CNC_01", 60);

        assertThat(rows).extracting(r -> r.get("status")).containsExactly("RUN", "WARN", "RUN");
        assertThat(rows).extracting(r -> r.get("seconds")).containsExactly(2, 2, 3);
        assertThat(rows.get(0).get("endedAt")).isNull(); // 진행 중인 구간
        assertThat(rows.get(1).get("endedAt")).isNotNull();
    }

    @Test
    void 실적을_작업지시_장비_순으로_돌려준다() {
        production("WINDER_01", 2);
        production("CNC_01", 3);

        List<Map<String, Object>> rows = productionQueryMapper.findAll();

        assertThat(rows).extracting(r -> r.get("equipmentId")).containsExactly("CNC_01", "WINDER_01");
        assertThat(rows.get(0))
                .containsEntry("workOrderId", "WO-20261024-001")
                .containsEntry("totalCount", 3)
                .containsEntry("goodCount", 3)
                .containsEntry("badCount", 0)
                .containsKey("lastUpdatedAt");
    }
}
