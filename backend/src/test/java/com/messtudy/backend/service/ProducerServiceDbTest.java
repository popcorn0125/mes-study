package com.messtudy.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
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

/** 테스트 DB(mes_test)에서 시뮬레이터 시작(넘겨받기) · 1초 전송 · 완료 → 다음 지시를 확인한다. */
@SpringBootTest
@ActiveProfiles("test")
class ProducerServiceDbTest {

    private static final List<String> LINE = List.of("CNC_01", "WINDER_01", "ASSEMBLY_01", "INSPECTION_01", "PACKER_01");

    @Autowired
    private ProducerService producerService;

    @Autowired
    private WorkOrderService workOrderService;

    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void clean() {
        TestDb.reset(jdbc);
    }

    private String releaseNew(int plannedQty, int priority) {
        String id = (String) workOrderService.create(new HashMap<>(Map.of("itemCode", "MOTOR_A", "plannedQty", plannedQty, "priority", priority)))
                .get("workOrderId");
        workOrderService.release(id);
        return id;
    }

    /** 설비 5대가 같은 양품 수를 보낸 1초치 데이터. workOrderId가 null이면 지시 없음(IDLE) */
    private static List<Map<String, Object>> tick(String workOrderId, int good) {
        List<Map<String, Object>> payload = new ArrayList<>();
        for (String equipmentId : LINE) {
            Map<String, Object> item = new HashMap<>();
            item.put("equipmentId", equipmentId);
            item.put("timestamp", "2026-10-28T01:00:00Z");
            item.put("status", workOrderId == null ? "IDLE" : "RUN");
            item.put("metrics", Map.of("temperature", 40.0, "vibration", 1.0));
            if (workOrderId != null) {
                item.put("workOrderId", workOrderId);
                item.put("production", Map.of("totalCount", good, "goodCount", good, "badCount", 0));
            }
            payload.add(item);
        }
        return payload;
    }

    private String statusOf(String workOrderId) {
        return (String) workOrderService.findById(workOrderId).get("status");
    }

    @Test
    void 시작하면_실행_ID와_진행_중_지시의_저장_수량을_돌려준다() {
        String id = releaseNew(3, 5);
        String firstRun = (String) producerService.start().get("runId");
        producerService.receive(firstRun, tick(id, 2));

        Map<String, Object> started = producerService.start();

        assertThat(started.get("runId")).isNotEqualTo(firstRun);
        @SuppressWarnings("unchecked")
        Map<String, Object> workOrder = (Map<String, Object>) started.get("workOrder");
        assertThat(workOrder).containsEntry("workOrderId", id).containsEntry("plannedQty", 3);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> performance = (List<Map<String, Object>>) workOrder.get("performance");
        assertThat(performance).allSatisfy(row -> assertThat(row).containsEntry("goodCount", 2));
    }

    @Test
    void 나중에_시작한_실행만_받고_밀려난_실행과_헤더_없는_요청은_409다() {
        String first = (String) producerService.start().get("runId");
        String second = (String) producerService.start().get("runId");

        assertThatThrownBy(() -> producerService.receive(first, tick(null, 0))).isInstanceOf(StateConflictException.class);
        assertThatThrownBy(() -> producerService.receive(null, tick(null, 0))).isInstanceOf(StateConflictException.class);
        assertThat(producerService.receive(second, tick(null, 0))).containsEntry("sensorLogs", 5);
    }

    @Test
    void 포장기_양품이_지시_수량에_이르면_완료되고_다음_지시가_진행된다() {
        String first = releaseNew(3, 5);
        String next = releaseNew(10, 5);
        String run = (String) producerService.start().get("runId");

        Map<String, Object> running = producerService.receive(run, tick(first, 2));
        assertThat(running.get("workOrder")).isEqualTo(Map.of("workOrderId", first, "plannedQty", 3));

        Map<String, Object> done = producerService.receive(run, tick(first, 3));

        assertThat(statusOf(first)).isEqualTo("COMPLETED");
        assertThat(workOrderService.findById(first)).containsEntry("completedQty", 3);
        assertThat(statusOf(next)).isEqualTo("IN_PROGRESS");
        assertThat(done.get("workOrder")).isEqualTo(Map.of("workOrderId", next, "plannedQty", 10));
    }

    @Test
    void 진행_중_지시가_없으면_센서_로그만_저장하고_지시는_null이다() {
        String run = (String) producerService.start().get("runId");

        Map<String, Object> result = producerService.receive(run, tick(null, 0));

        assertThat(result).containsEntry("sensorLogs", 5).containsEntry("productions", 0).containsEntry("workOrder", null);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM equipment_sensor_log WHERE status = 'IDLE'", Integer.class)).isEqualTo(5);
    }
}
