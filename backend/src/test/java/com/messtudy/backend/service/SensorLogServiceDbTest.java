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

import com.messtudy.backend.TestDb;

/** 테스트 DB(mes_test)에서 센서 로그 · 실적 · 생산 이벤트 저장과 트랜잭션 롤백을 확인한다. */
@SpringBootTest
@ActiveProfiles("test")
class SensorLogServiceDbTest {

    @Autowired
    private SensorLogService service;

    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        TestDb.resetWithWorkOrder(jdbc);
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

    private static Map<String, Object> item(int total, int good, int bad) {
        return Map.of(
                "equipmentId", "CNC_01",
                "timestamp", "2026-10-24T23:37:12.451Z",
                "status", "RUN",
                "workOrderId", TestDb.WORK_ORDER_ID,
                "metrics", Map.of("temperature", 49.4, "vibration", 2.8),
                "production", Map.of("totalCount", total, "goodCount", good, "badCount", bad));
    }

    @Test
    void 누적_수량이_늘어난_만큼만_생산_이벤트가_생긴다() {
        service.save(List.of(item(3, 3, 0)));   // 처음: 0에서 3개
        service.save(List.of(item(3, 3, 0)));   // 그대로: 이벤트 없음
        service.save(List.of(item(5, 4, 1)));   // 양품 1 · 불량 1 늘어남
        service.save(List.of(item(4, 4, 0)));   // 늦게 온 옛 요청: 이벤트 없음(실적도 그대로)

        List<Map<String, Object>> events = jdbc.queryForList(
                "SELECT good_qty, bad_qty, occurred_at FROM production_event ORDER BY id");
        assertThat(events).extracting(e -> e.get("good_qty") + "/" + e.get("bad_qty")).containsExactly("3/0", "1/1");
        assertThat(jdbc.queryForObject("SELECT occurred_at = '2026-10-24T23:37:12.451Z' FROM production_event LIMIT 1",
                Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("SELECT total_count FROM production_performance", Integer.class)).isEqualTo(5);
    }

    @Test
    void 센서_로그에_진행_중이던_작업지시를_남기고_지시가_없으면_null이다() {
        Map<String, Object> idle = Map.of(
                "equipmentId", "WINDER_01",
                "timestamp", "2026-10-24T23:37:12.451Z",
                "status", "IDLE",
                "metrics", Map.of("temperature", 40.0, "vibration", 1.0));

        service.save(List.of(item(1, 1, 0), idle));

        assertThat(jdbc.queryForList("SELECT equipment_id, work_order_id FROM equipment_sensor_log ORDER BY equipment_id"))
                .extracting(r -> r.get("equipment_id") + "=" + r.get("work_order_id"))
                .containsExactly("CNC_01=" + TestDb.WORK_ORDER_ID, "WINDER_01=null");
    }

    @Test
    void 실적_저장이_실패하면_센서_로그도_저장되지_않는다() {
        // 센서 로그는 설비 외래 키가 없어 들어가고, 뒤의 생산 이벤트 · 실적 저장이 없는 설비라 실패한다
        assertThatThrownBy(() -> service.save(List.of(item(TestDb.WORK_ORDER_ID, "NO_SUCH_EQUIPMENT", 1))))
                .isInstanceOf(DataIntegrityViolationException.class);

        assertThat(count("equipment_sensor_log")).isZero();
        assertThat(count("production_performance")).isZero();
        assertThat(count("production_event")).isZero();
    }
}
