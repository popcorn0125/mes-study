package com.messtudy.backend.mapper;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import com.messtudy.backend.TestDb;

/** 테스트 DB(mes_test)에 실제로 넣고 읽어 SQL을 확인한다. */
@SpringBootTest
@ActiveProfiles("test")
class MapperDbTest {

    @Autowired
    private SensorLogMapper sensorLogMapper;

    @Autowired
    private ProductionPerformanceMapper productionMapper;

    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        TestDb.resetWithWorkOrder(jdbc);
    }

    private static Map<String, Object> log(String equipmentId, String temperature) {
        Map<String, Object> log = new HashMap<>();
        log.put("equipmentId", equipmentId);
        log.put("recordedAt", OffsetDateTime.parse("2026-10-24T23:37:12.451Z"));
        log.put("status", "RUN");
        log.put("temperature", temperature == null ? null : new BigDecimal(temperature));
        log.put("vibration", new BigDecimal("1.2"));
        return log;
    }

    private static Map<String, Object> production(String equipmentId, int total, int good, int bad) {
        return Map.of("workOrderId", "WO-20261024-001", "equipmentId", equipmentId,
                "totalCount", total, "goodCount", good, "badCount", bad);
    }

    private Map<String, Object> performanceOf(String equipmentId) {
        return jdbc.queryForMap(
                "SELECT total_count, good_count, bad_count FROM production_performance WHERE equipment_id = ?", equipmentId);
    }

    @Test
    void 센서_로그_여러_행을_한_번에_넣는다() {
        int inserted = sensorLogMapper.insertAll(List.of(log("CNC_01", "82.4"), log("WINDER_01", null)));

        assertThat(inserted).isEqualTo(2);
        Map<String, Object> row = jdbc.queryForMap(
                "SELECT equipment_id, recorded_at, status, temperature, vibration, created_at FROM equipment_sensor_log WHERE equipment_id = 'CNC_01'");
        assertThat(row.get("status")).isEqualTo("RUN");
        assertThat((BigDecimal) row.get("temperature")).isEqualByComparingTo("82.4");
        assertThat(row.get("created_at")).isNotNull();
        OffsetDateTime recordedAt = jdbc.queryForObject(
                "SELECT recorded_at FROM equipment_sensor_log WHERE equipment_id = 'CNC_01'", OffsetDateTime.class);
        assertThat(recordedAt.toInstant()).isEqualTo(OffsetDateTime.parse("2026-10-24T23:37:12.451Z").toInstant());
        assertThat(jdbc.queryForObject(
                "SELECT temperature FROM equipment_sensor_log WHERE equipment_id = 'WINDER_01'", BigDecimal.class)).isNull();
    }

    @Test
    void 실적은_처음엔_추가하고_다음엔_같은_행을_갱신한다() {
        assertThat(productionMapper.upsertAll(List.of(production("CNC_01", 1, 1, 0), production("WINDER_01", 1, 1, 0))))
                .isEqualTo(2);
        assertThat(productionMapper.upsertAll(List.of(production("CNC_01", 2, 1, 1)))).isEqualTo(1);

        assertThat(jdbc.queryForObject("SELECT count(*) FROM production_performance", Integer.class)).isEqualTo(2);
        assertThat(performanceOf("CNC_01")).isEqualTo(Map.of("total_count", 2, "good_count", 1, "bad_count", 1));
    }

    @Test
    void 지금_값보다_작은_누적_수량은_덮어쓰지_않는다() {
        productionMapper.upsertAll(List.of(production("CNC_01", 13, 13, 0)));

        int updated = productionMapper.upsertAll(List.of(production("CNC_01", 12, 12, 0))); // 늦게 도착한 옛날 요청

        assertThat(updated).isZero();
        assertThat(performanceOf("CNC_01")).isEqualTo(Map.of("total_count", 13, "good_count", 13, "bad_count", 0));
    }

    @Test
    void 같은_누적_수량은_다시_써도_된다() {
        productionMapper.upsertAll(List.of(production("CNC_01", 13, 13, 0)));

        assertThat(productionMapper.upsertAll(List.of(production("CNC_01", 13, 13, 0)))).isEqualTo(1);
    }
}
