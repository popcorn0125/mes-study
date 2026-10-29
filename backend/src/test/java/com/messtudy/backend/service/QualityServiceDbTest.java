package com.messtudy.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import com.messtudy.backend.TestDb;

/** 테스트 DB(mes_test)에서 품질 합계 SQL(구간 · 미분류 · 작업지시별)을 확인한다. */
@SpringBootTest
@ActiveProfiles("test")
class QualityServiceDbTest {

    private static final String OTHER = "WO-20261024-002";

    @Autowired
    private QualityService service;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private SensorAggregator aggregator;

    @BeforeEach
    void clean() {
        TestDb.resetWithWorkOrder(jdbc, aggregator);
        jdbc.update("UPDATE work_order SET started_at = now() - INTERVAL '30 minutes'");
        jdbc.update("INSERT INTO work_order (work_order_id, item_code, planned_qty, status, started_at, completed_at) "
                + "VALUES (?, 'MOTOR_B', 10, 'COMPLETED', now() - INTERVAL '50 minutes', now() - INTERVAL '40 minutes')", OTHER);
    }

    private void event(String equipmentId, String workOrderId, int secondsAgo, int good, int bad) {
        jdbc.update("INSERT INTO production_event (work_order_id, equipment_id, occurred_at, good_qty, bad_qty) "
                + "VALUES (?, ?, now() - ? * INTERVAL '1 second', ?, ?)", workOrderId, equipmentId, secondsAgo, good, bad);
    }

    private void defect(String equipmentId, String code, String workOrderId, int secondsAgo, int qty) {
        jdbc.update("INSERT INTO defect_event (work_order_id, equipment_id, defect_code, occurred_at, qty) "
                + "VALUES (?, ?, ?, now() - ? * INTERVAL '1 second', ?)", workOrderId, equipmentId, code, secondsAgo, qty);
    }

    @Test
    @SuppressWarnings("unchecked")
    void 구간_안의_불량을_유형별로_세고_유형_없는_불량은_미분류다() {
        event("ASSEMBLY_01", TestDb.WORK_ORDER_ID, 60, 5, 4);
        defect("ASSEMBLY_01", "ASSEMBLY_FASTENING", TestDb.WORK_ORDER_ID, 60, 2);
        defect("ASSEMBLY_01", "ASSEMBLY_MISSING_PART", TestDb.WORK_ORDER_ID, 60, 1);
        event("ASSEMBLY_01", TestDb.WORK_ORDER_ID, 2 * 3600, 0, 3);                         // 2시간 전: 1시간 구간 밖
        defect("ASSEMBLY_01", "ASSEMBLY_MISSING_PART", TestDb.WORK_ORDER_ID, 2 * 3600, 3);

        Map<String, Object> result = service.summary("1h");

        assertThat((List<Map<String, Object>>) result.get("defects"))
                .extracting(r -> r.get("defectName") + ":" + r.get("count") + ":" + r.get("equipmentName"))
                .containsExactly("조립 체결 불량:2:조립 셀 #1", "부품 누락:1:조립 셀 #1", "미분류:1:null");
        assertThat((Map<String, Object>) result.get("summary")).containsEntry("badCount", 4L);
        assertThat((List<Map<String, Object>>) service.summary("8h").get("defects"))
                .extracting(r -> r.get("defectName") + ":" + r.get("count"))
                .containsExactly("부품 누락:4", "조립 체결 불량:2", "미분류:1");
    }

    @Test
    @SuppressWarnings("unchecked")
    void 작업지시별로_완성품_불량_가장_많은_유형을_센다() {
        event("PACKER_01", TestDb.WORK_ORDER_ID, 60, 6, 0);
        event("CNC_01", TestDb.WORK_ORDER_ID, 60, 7, 2);
        defect("CNC_01", "MACHINING_SURFACE", TestDb.WORK_ORDER_ID, 60, 2);
        event("PACKER_01", OTHER, 45 * 60, 3, 1);                                         // 유형 없는 불량만

        List<Map<String, Object>> rows = (List<Map<String, Object>>) service.summary("1h").get("workOrders");

        assertThat(rows).extracting(r -> r.get("workOrderId") + ":" + r.get("itemCode") + ":" + r.get("finishedCount")
                + ":" + r.get("badCount") + ":" + r.get("topDefectName"))
                .containsExactly(TestDb.WORK_ORDER_ID + ":MOTOR_A:6:2:가공면 흠집", OTHER + ":MOTOR_B:3:1:null");
    }

    @Test
    @SuppressWarnings("unchecked")
    void 불량률_추이는_생산이_있던_칸만_돌려준다() {
        event("CNC_01", TestDb.WORK_ORDER_ID, 20, 9, 1);

        Map<String, Object> trend = service.trend("1h");
        List<Map<String, Object>> points = (List<Map<String, Object>>) trend.get("points");

        assertThat(trend).containsEntry("bucketSec", 300);
        assertThat(points).hasSize(1);
        assertThat(points.get(0)).containsEntry("totalCount", 10L).containsEntry("badCount", 1L).containsEntry("defectRate", 0.1);
    }
}
