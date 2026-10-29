package com.messtudy.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
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

/**
 * 테스트 DB(mes_test)에서 수신(SensorLogService) → 1분 요약 플러시 · 복구 · 조회를 확인한다.
 * 시각은 지금 기준 "n초 전"으로 보낸다(조회 API가 지금 기준 최근 n분이다).
 */
@SpringBootTest
@ActiveProfiles("test")
class SensorRollupServiceDbTest {

    @Autowired
    private SensorLogService sensorLogService;

    @Autowired
    private SensorRollupService service;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private SensorAggregator aggregator;

    private Instant now;

    @BeforeEach
    void clean() {
        TestDb.resetWithWorkOrder(jdbc, aggregator);
        now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
    }

    private static Map<String, Object> item(String equipmentId, Instant at, String status, String workOrderId, double temperature) {
        Map<String, Object> item = new HashMap<>();
        item.put("equipmentId", equipmentId);
        item.put("timestamp", at.toString());
        item.put("status", status);
        item.put("metrics", Map.of("temperature", temperature, "vibration", 1.5));
        if (workOrderId != null) {
            item.put("workOrderId", workOrderId);
            item.put("production", Map.of("totalCount", 0, "goodCount", 0, "badCount", 0));
        }
        return item;
    }

    /** 1초에 1행씩 secondsAgo초 전부터 count초 동안 보낸다(요청 하나에 한 행) */
    private void send(String equipmentId, String status, String workOrderId, int secondsAgo, int count) {
        for (int i = 0; i < count; i++) {
            Instant at = now.minusSeconds(secondsAgo - i);
            sensorLogService.save(List.of(item(equipmentId, at, status, workOrderId, 60 + (i % 7))));
        }
    }

    /** 같은 시각들을 바꾸기 전 방식(원본 1행 = 1초)으로 원본 테이블에도 넣어 둔다: 정확도 비교용 */
    private void sendWithRaw(String equipmentId, String status, String workOrderId, int secondsAgo, int count) {
        send(equipmentId, status, workOrderId, secondsAgo, count);
        jdbc.update("INSERT INTO equipment_sensor_log (equipment_id, recorded_at, status, work_order_id) "
                + "SELECT ?, ? - (? - s) * INTERVAL '1 second', ?, ? FROM generate_series(0, ? - 1) s",
                equipmentId, OffsetDateTime.ofInstant(now, ZoneOffset.UTC), secondsAgo, status, workOrderId, count);
    }

    private Map<String, Object> rowOf(List<Map<String, Object>> rows, String equipmentId) {
        return rows.stream().filter(r -> equipmentId.equals(r.get("equipmentId"))).findFirst().orElseThrow();
    }

    private List<Map<String, Object>> minuteRows() {
        return jdbc.queryForList("SELECT equipment_id, bucket_start, work_order_id, sample_count, temperature_sum, "
                + "temperature_count, temperature_min, temperature_max, run_sec, warn_sec, down_sec, idle_sec, last_status "
                + "FROM equipment_sensor_minute ORDER BY 1, 2, 3");
    }

    @Test
    void 요약_DB_값과_아직_안_넣은_메모리를_합친_OEE_초가_원본을_센_값과_같다() {
        jdbc.update("UPDATE work_order SET started_at = now() - INTERVAL '30 minutes'");
        sendWithRaw("CNC_01", "RUN", TestDb.WORK_ORDER_ID, 200, 90);
        sendWithRaw("CNC_01", "DOWN", TestDb.WORK_ORDER_ID, 110, 20);
        sendWithRaw("CNC_01", "WARN", TestDb.WORK_ORDER_ID, 90, 30);
        sendWithRaw("CNC_01", "IDLE", null, 60, 60);                  // 지시 없음: 계획 시간에서 빠진다
        sendWithRaw("WINDER_01", "RUN", TestDb.WORK_ORDER_ID, 150, 150);
        // 2분 전까지 끝난 분만 DB에 넣고, 나머지는 메모리에 남긴다
        service.flush(now.minusSeconds(120 - 65));

        OffsetDateTime from = OffsetDateTime.ofInstant(now.minusSeconds(3600), ZoneOffset.UTC);
        OffsetDateTime to = OffsetDateTime.ofInstant(now.plusSeconds(1), ZoneOffset.UTC);
        List<Map<String, Object>> rollup = service.sumSeconds(from, to, null, null);
        Map<String, Object> raw = jdbc.queryForMap("""
                SELECT count(*) AS planned, count(*) FILTER (WHERE status IN ('RUN', 'WARN')) AS run,
                       count(*) FILTER (WHERE status = 'DOWN') AS down, count(*) FILTER (WHERE status = 'IDLE') AS idle
                FROM equipment_sensor_log WHERE equipment_id = 'CNC_01' AND work_order_id IS NOT NULL""");

        assertThat(jdbc.queryForObject("SELECT count(*) FROM equipment_sensor_minute", Integer.class)).isPositive();
        assertThat(aggregator.pendingRows()).isNotEmpty();
        assertThat(rowOf(rollup, "CNC_01")).containsEntry("plannedSec", raw.get("planned")).containsEntry("runSec", raw.get("run"))
                .containsEntry("downSec", raw.get("down")).containsEntry("idleSec", raw.get("idle"));
        assertThat(rowOf(rollup, "WINDER_01")).containsEntry("plannedSec", 150L);
        // 작업지시 기준도 같다
        assertThat(rowOf(service.sumSeconds(null, null, TestDb.WORK_ORDER_ID, null), "CNC_01")).containsEntry("plannedSec", 140L);
        // 상태 비율(최근 60분)은 지시 없는 대기까지 센다
        assertThat(service.statusSeconds(60)).filteredOn(r -> "CNC_01".equals(r.get("equipmentId")))
                .extracting(r -> r.get("status") + "=" + r.get("seconds"))
                .containsExactly("DOWN=20", "IDLE=60", "RUN=90", "WARN=30");
    }

    @Test
    void 플러시한_뒤에_같은_분의_새_값이_오면_DB_행에_합친다() {
        Instant minute = now.truncatedTo(ChronoUnit.MINUTES).minusSeconds(120);
        sensorLogService.save(List.of(item("CNC_01", minute.plusSeconds(10), "RUN", null, 60.0)));
        service.flush(now.plusSeconds(3600));
        sensorLogService.save(List.of(item("CNC_01", minute.plusSeconds(50), "DOWN", null, 70.0))); // 끊겼다가 늦게 온 같은 분
        service.flush(now.plusSeconds(3600));

        Map<String, Object> row = jdbc.queryForMap("SELECT sample_count, temperature_avg, temperature_min, temperature_max, "
                + "run_sec, down_sec, last_status FROM equipment_sensor_minute");
        assertThat(row).containsEntry("sample_count", 2).containsEntry("run_sec", 1).containsEntry("down_sec", 1)
                .containsEntry("last_status", "DOWN");
        assertThat((BigDecimal) row.get("temperature_avg")).isEqualByComparingTo("65.00");
        assertThat((BigDecimal) row.get("temperature_min")).isEqualByComparingTo("60.00");
        assertThat((BigDecimal) row.get("temperature_max")).isEqualByComparingTo("70.00");
    }

    @Test
    void 서버가_죽어_메모리를_잃어도_스풀로_복구하면_끝까지_받은_것과_요약이_같다() {
        send("CNC_01", "RUN", TestDb.WORK_ORDER_ID, 150, 100);
        send("CNC_01", "WARN", TestDb.WORK_ORDER_ID, 50, 45);
        send("WINDER_01", "IDLE", null, 130, 125);
        // 기대값: 메모리를 모두 넣었을 때
        service.flushAll();
        List<Map<String, Object>> expected = minuteRows();

        // 다시: 일부 분만 넣은 상태에서 서버가 죽는다(메모리 · 열린 파일을 잃는다)
        TestDb.resetWithWorkOrder(jdbc, aggregator);
        send("CNC_01", "RUN", TestDb.WORK_ORDER_ID, 150, 100);
        send("CNC_01", "WARN", TestDb.WORK_ORDER_ID, 50, 45);
        send("WINDER_01", "IDLE", null, 130, 125);
        service.flush(now.minusSeconds(60));
        aggregator.clear();

        service.recover();
        assertThat(minuteRows()).isEqualTo(expected);
        service.recover(); // 두 번 복구해도 같다(덮어쓰기)
        assertThat(minuteRows()).isEqualTo(expected);

        // 최근 10분 · 상태 추적도 되살아나서 같은 값을 다시 보내면(재전송) 버린다
        assertThat(aggregator.tracker("CNC_01").lastSeen()).isEqualTo(now.minusSeconds(6));
        assertThat(service.recentLogs("CNC_01", 10)).hasSize(145);
        assertThat(sensorLogService.save(List.of(item("CNC_01", now.minusSeconds(6), "WARN", TestDb.WORK_ORDER_ID, 60))))
                .containsEntry("sensorLogs", 0);
    }

    @Test
    void 상태가_바뀐_구간을_최신부터_돌려준다() {
        // 7초 전부터 1초 전까지: RUN 3초 → WARN 2초 → RUN 2초(진행 중)
        String[] statuses = { "RUN", "RUN", "RUN", "WARN", "WARN", "RUN", "RUN" };
        for (int i = 0; i < statuses.length; i++) {
            sensorLogService.save(List.of(item("CNC_01", now.minusSeconds(7 - i), statuses[i], null, 40)));
        }
        sensorLogService.save(List.of(item("WINDER_01", now.minusSeconds(3), "DOWN", null, 40))); // 다른 설비는 섞이지 않는다

        List<Map<String, Object>> rows = service.statusChanges("CNC_01", 60);

        assertThat(rows).extracting(r -> r.get("status")).containsExactly("RUN", "WARN", "RUN");
        assertThat(rows).extracting(r -> r.get("seconds")).containsExactly(2L, 2L, 3L);
        assertThat(rows.get(0).get("endedAt")).isNull();
        assertThat(rows.get(1).get("endedAt")).isNotNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM equipment_status_change", Integer.class)).isEqualTo(4);
    }

    @Test
    void 수신이_5초_넘게_끊기면_같은_상태여도_구간을_나누고_끊긴_시간은_세지_않는다() {
        for (int s : new int[] { 20, 19, 18, 7, 6, 5 }) {
            sensorLogService.save(List.of(item("CNC_01", now.minusSeconds(s), "RUN", null, 40)));
        }

        List<Map<String, Object>> rows = service.statusChanges("CNC_01", 60);

        assertThat(rows).extracting(r -> r.get("status")).containsExactly("RUN", "RUN");
        assertThat(rows).extracting(r -> r.get("seconds")).containsExactly(3L, 3L);
        assertThat(rows).allSatisfy(r -> assertThat(r.get("endedAt")).isNotNull()); // 마지막이 5초 전이라 진행 중 아님
    }

    @Test
    void 최근_10분은_1초_원본_더_길면_분마다_평균이고_메모리가_비면_요약의_마지막_값을_쓴다() {
        send("CNC_01", "RUN", null, 900, 10);  // 15분 전
        send("CNC_01", "WARN", null, 30, 30);  // 30초 전 ~ 1초 전
        service.flush(now.plusSeconds(3600));

        assertThat(service.recentLogs("CNC_01", 10)).hasSize(30)
                .allSatisfy(p -> assertThat(p).containsOnlyKeys("recordedAt", "status", "temperature", "vibration"));
        List<Map<String, Object>> minutes = service.recentLogs("CNC_01", 20);
        assertThat(minutes).hasSizeBetween(2, 4).first().satisfies(p -> assertThat(p).containsEntry("status", "RUN"));

        aggregator.clear();
        Map<String, Object> latest = rowOf(service.latest(), "CNC_01");
        assertThat(latest).containsEntry("status", "WARN");
        assertThat(OeeService.toInstant(latest.get("recordedAt"))).isEqualTo(now.minusSeconds(1));
        assertThat(service.recentLogs("CNC_01", 10)).isNotEmpty(); // 메모리가 비면 요약에서 분마다 1점
    }

    @Test
    void 처음_받는_설비의_첫_구간은_남아_있던_진행_중_행을_끝낸다() {
        jdbc.update("INSERT INTO equipment_status_change (equipment_id, status, started_at) VALUES ('CNC_01', 'RUN', ?)",
                OffsetDateTime.ofInstant(now.minusSeconds(300), ZoneOffset.UTC));

        sensorLogService.save(List.of(item("CNC_01", now.minusSeconds(2), "IDLE", null, 40)));

        List<Map<String, Object>> rows = new ArrayList<>(jdbc.queryForList(
                "SELECT status, ended_at IS NULL AS open FROM equipment_status_change ORDER BY started_at"));
        assertThat(rows).extracting(r -> r.get("status") + "/" + r.get("open")).containsExactly("RUN/false", "IDLE/true");
    }
}
