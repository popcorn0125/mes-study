package com.messtudy.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import com.messtudy.backend.TestDb;

/** 테스트 DB(mes_test)에서 OEE 합계 SQL(계획 가동 시간 · 구간 · 작업지시 구분)을 확인한다. */
@SpringBootTest
@ActiveProfiles("test")
class OeeServiceDbTest {

    private static final String OTHER = "WO-20261024-002";

    @Autowired
    private OeeService service;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private SensorAggregator aggregator;

    @BeforeEach
    void clean() {
        TestDb.resetWithWorkOrder(jdbc, aggregator);
        jdbc.update("UPDATE work_order SET started_at = now() - INTERVAL '30 minutes'");
        jdbc.update("INSERT INTO work_order (work_order_id, item_code, planned_qty, status, started_at, completed_at) "
                + "VALUES (?, 'MOTOR_A', 10, 'COMPLETED', now() - INTERVAL '50 minutes', now() - INTERVAL '40 minutes')", OTHER);
    }

    /**
     * 지금부터 secondsAgo초 전까지 거꾸로 count초 동안 1초에 1행을 받은 것처럼 1분 요약에 넣는다
     * (메모리 버킷을 플러시한 것과 같은 행: 분마다 받은 행 수 · 상태별 초, 같은 키는 더한다)
     */
    private void logs(String equipmentId, String workOrderId, String status, int secondsAgo, int count) {
        jdbc.update("""
                INSERT INTO equipment_sensor_minute AS t (equipment_id, bucket_start, work_order_id, sample_count,
                    run_sec, warn_sec, down_sec, idle_sec, last_status, last_recorded_at)
                SELECT ?, date_trunc('minute', at), COALESCE(?, ''), count(*),
                       count(*) FILTER (WHERE ? = 'RUN'), count(*) FILTER (WHERE ? = 'WARN'),
                       count(*) FILTER (WHERE ? = 'DOWN'), count(*) FILTER (WHERE ? = 'IDLE'), ?, max(at)
                FROM (SELECT now() - (? + s) * INTERVAL '1 second' AS at FROM generate_series(0, ? - 1) s) g
                GROUP BY 2
                ON CONFLICT (equipment_id, bucket_start, work_order_id) DO UPDATE SET
                    sample_count = t.sample_count + EXCLUDED.sample_count, run_sec = t.run_sec + EXCLUDED.run_sec,
                    warn_sec = t.warn_sec + EXCLUDED.warn_sec, down_sec = t.down_sec + EXCLUDED.down_sec,
                    idle_sec = t.idle_sec + EXCLUDED.idle_sec
                """, equipmentId, workOrderId, status, status, status, status, status, secondsAgo, count);
    }

    private void event(String equipmentId, String workOrderId, int secondsAgo, int good, int bad) {
        jdbc.update("INSERT INTO production_event (work_order_id, equipment_id, occurred_at, good_qty, bad_qty) "
                + "VALUES (?, ?, now() - ? * INTERVAL '1 second', ?, ?)", workOrderId, equipmentId, secondsAgo, good, bad);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> row(Map<String, Object> result, String id) {
        return ((List<Map<String, Object>>) result.get("equipment")).stream()
                .filter(r -> r.get("equipmentId").equals(id)).findFirst().orElseThrow();
    }

    @Test
    void 작업지시가_없던_로그는_계획_가동_시간에서_빠지고_대기는_손실로_센다() {
        logs("CNC_01", TestDb.WORK_ORDER_ID, "RUN", 10, 90);
        logs("CNC_01", TestDb.WORK_ORDER_ID, "IDLE", 100, 10); // 앞 공정 기다림: 손실
        logs("CNC_01", null, "IDLE", 200, 300);               // 지시 없음: 계획 정지
        event("CNC_01", TestDb.WORK_ORDER_ID, 20, 2, 0);

        Map<String, Object> cnc = row(service.summary("1h"), "CNC_01");

        assertThat(cnc).containsEntry("plannedSec", 100L).containsEntry("runSec", 90L).containsEntry("idleSec", 10L)
                .containsEntry("goodCount", 2L).containsEntry("availability", 0.9)
                .containsEntry("performance", 1.0); // 2 × 45초 = 90초
    }

    @Test
    @SuppressWarnings("unchecked")
    void 구간_밖의_로그와_이벤트는_세지_않는다() {
        logs("PACKER_01", TestDb.WORK_ORDER_ID, "RUN", 10, 100);
        logs("PACKER_01", TestDb.WORK_ORDER_ID, "RUN", 2 * 3600, 100); // 2시간 전
        event("PACKER_01", TestDb.WORK_ORDER_ID, 30, 2, 0);
        event("PACKER_01", TestDb.WORK_ORDER_ID, 2 * 3600, 5, 0);

        Map<String, Object> result = service.summary("1h");

        assertThat(row(result, "PACKER_01")).containsEntry("plannedSec", 100L).containsEntry("goodCount", 2L);
        // 라인 OEE = 포장 양품 2 × 병목 50초 ÷ 계획 100초
        assertThat((Map<String, Object>) result.get("line")).containsEntry("oee", 1.0).containsEntry("plannedSec", 100L);
        assertThat(row(service.summary("8h"), "PACKER_01")).containsEntry("plannedSec", 200L).containsEntry("goodCount", 7L);
    }

    @Test
    void 작업지시별_OEE는_그_지시의_로그와_이벤트만_센다() {
        logs("CNC_01", TestDb.WORK_ORDER_ID, "RUN", 10, 100);
        logs("CNC_01", OTHER, "RUN", 42 * 60, 200);
        event("CNC_01", TestDb.WORK_ORDER_ID, 20, 1, 1);
        event("CNC_01", OTHER, 42 * 60, 4, 0);

        Map<String, Object> mine = service.forWorkOrder(TestDb.WORK_ORDER_ID);
        Map<String, Object> other = service.forWorkOrder(OTHER);

        assertThat(mine).containsEntry("workOrderId", TestDb.WORK_ORDER_ID).containsEntry("to", null);
        assertThat(row(mine, "CNC_01")).containsEntry("plannedSec", 100L).containsEntry("totalCount", 2L).containsEntry("quality", 0.5);
        assertThat(row(other, "CNC_01")).containsEntry("plannedSec", 200L).containsEntry("goodCount", 4L);
        assertThatThrownBy(() -> service.forWorkOrder("WO-NONE")).isInstanceOf(NotFoundException.class);
    }

    @Test
    @SuppressWarnings("unchecked")
    void 추이는_지시가_있던_칸만_돌려준다() {
        logs("PACKER_01", TestDb.WORK_ORDER_ID, "RUN", 10, 60);
        logs("PACKER_01", null, "IDLE", 30 * 60, 60); // 30분 전 칸: 지시 없음 → 칸 없음
        event("PACKER_01", TestDb.WORK_ORDER_ID, 20, 1, 0);

        Map<String, Object> trend = service.trend("1h");
        List<Map<String, Object>> points = (List<Map<String, Object>>) trend.get("points");

        assertThat(trend).containsEntry("bucketSec", 300);
        // 지금 칸과 바로 앞 칸에 걸칠 수 있다(5분 경계). 합치면 계획 60초 · 포장 양품 1개
        assertThat(points).isNotEmpty().allSatisfy(p -> assertThat(p).containsKeys("bucketStart", "oee"));
        assertThat(points.stream().mapToLong(p -> (long) p.get("plannedSec")).sum()).isEqualTo(60L);
        assertThat(points.stream().mapToLong(p -> (long) p.get("goodCount")).sum()).isEqualTo(1L);
    }
}
