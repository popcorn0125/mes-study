package com.messtudy.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
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

/** 테스트 DB(mes_test)에서 수신 때 정지 만들기와 정지 조회 · 사유 입력을 확인한다. */
@SpringBootTest
@ActiveProfiles("test")
class DowntimeServiceDbTest {

    @Autowired
    private SensorLogService sensorLogService;

    @Autowired
    private DowntimeService service;

    @Autowired
    private JdbcTemplate jdbc;

    /** 30분 전 정각 초. 오늘 · 1시간 구간 안이다(자정 직후 30분 동안 돌리면 오늘 구간 밖일 수 있다) */
    private final OffsetDateTime base = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(30).truncatedTo(ChronoUnit.SECONDS);

    @BeforeEach
    void clean() {
        TestDb.resetWithWorkOrder(jdbc);
    }

    private static Map<String, Object> log(String equipmentId, OffsetDateTime at, String status, String alarmCode) {
        Map<String, Object> item = new HashMap<>();
        item.put("equipmentId", equipmentId);
        item.put("timestamp", at.toString());
        item.put("status", status);
        item.put("workOrderId", TestDb.WORK_ORDER_ID);
        item.put("metrics", Map.of("temperature", 49.4, "vibration", 2.8));
        item.put("production", Map.of("totalCount", 0, "goodCount", 0, "badCount", 0));
        item.put("alarmCode", alarmCode);
        return item;
    }

    /** from초부터 seconds초 동안 매초 DOWN 한 행씩 보낸다 */
    private void down(String equipmentId, int from, int seconds, String alarmCode) {
        for (int s = from; s < from + seconds; s++) {
            sensorLogService.save(List.of(log(equipmentId, base.plusSeconds(s), "DOWN", alarmCode)));
        }
    }

    private List<Map<String, Object>> downtimes() {
        return jdbc.queryForList("SELECT equipment_id, duration_sec, alarm_code, reason_code, reason_source FROM downtime ORDER BY id");
    }

    @Test
    void 이어진_고장은_한_건이고_끊기거나_알람이_바뀌면_새_건이다() {
        down("CNC_01", 0, 3, null);
        sensorLogService.save(List.of(log("CNC_01", base.plusSeconds(3), "RUN", null)));
        down("CNC_01", 6, 2, null);                    // 마지막(2초)에서 4초 뒤: 이어 붙인다
        down("CNC_01", 20, 2, null);                   // 12초 끊김: 새 건
        down("CNC_01", 22, 2, "CNC_SPINDLE_OVERLOAD"); // 알람이 바뀜: 새 건
        down("WINDER_01", 0, 2, null);                 // 다른 설비: 따로

        assertThat(downtimes()).extracting(d -> d.get("equipment_id") + "/" + d.get("duration_sec") + "/" + d.get("alarm_code"))
                .containsExactly("CNC_01/5/null", "CNC_01/2/null", "CNC_01/2/CNC_SPINDLE_OVERLOAD", "WINDER_01/2/null");
    }

    @Test
    void 같은_요청이_다시_오거나_옛_요청이_늦게_와도_정지_시간이_늘지_않는다() {
        down("CNC_01", 0, 3, null);
        down("CNC_01", 2, 1, null); // 같은 요청 다시
        down("CNC_01", 1, 1, null); // 옛 요청

        assertThat(downtimes()).extracting(d -> d.get("duration_sec")).containsExactly(3);
    }

    @Test
    void 알람이_있으면_알람의_사유가_자동으로_붙고_다른_설비의_알람은_전체가_저장되지_않는다() {
        down("PACKER_01", 0, 2, "PACKER_FILM_EMPTY");

        assertThat(downtimes().get(0)).containsEntry("reason_code", "MATERIAL_SHORTAGE").containsEntry("reason_source", "AUTO");

        int logs = jdbc.queryForObject("SELECT count(*) FROM equipment_sensor_log", Integer.class);
        assertThatThrownBy(() -> sensorLogService.save(List.of(
                log("WINDER_01", base.plusSeconds(10), "RUN", null),
                log("CNC_01", base.plusSeconds(10), "DOWN", "PACKER_JAM"))))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> sensorLogService.save(List.of(log("CNC_01", base.plusSeconds(11), "DOWN", "NO_SUCH"))))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM equipment_sensor_log", Integer.class)).isEqualTo(logs);
        assertThat(downtimes()).hasSize(1);
    }

    @Test
    @SuppressWarnings("unchecked")
    void 요약은_사유_미입력_순간_정지를_나누고_목록은_60초_이상만_보인다() {
        down("CNC_01", 0, 70, "CNC_TOOL_BREAK");      // 자동 사유(공구 · 지그) 70초
        down("WINDER_01", 0, 60, null);               // 60초: 사유 미입력
        down("ASSEMBLY_01", 0, 59, null);             // 59초: 순간 정지
        down("PACKER_01", 0, 4, null);                // 4초: 순간 정지

        Map<String, Object> summary = service.summary("1h");

        assertThat((Map<String, Object>) summary.get("summary")).containsEntry("downSec", 193L)
                .containsEntry("stopCount", 2L).containsEntry("pendingCount", 1L).containsEntry("microSec", 63L);
        assertThat((List<Map<String, Object>>) summary.get("reasons"))
                .extracting(r -> r.get("reasonName") + "/" + r.get("seconds") + "/" + r.get("count"))
                .containsExactly("공구 · 지그 문제/70/1", "사유 미입력/60/1", "순간 정지/63/2");

        List<Map<String, Object>> all = (List<Map<String, Object>>) service.list("1h", false).get("downtimes");
        assertThat(all).extracting(d -> d.get("equipmentId")).containsExactlyInAnyOrder("CNC_01", "WINDER_01");
        assertThat(all).allSatisfy(d -> assertThat(d).containsEntry("ongoing", false));
        List<Map<String, Object>> pending = (List<Map<String, Object>>) service.list("1h", true).get("downtimes");
        assertThat(pending).extracting(d -> d.get("equipmentId")).containsExactly("WINDER_01");
    }

    @Test
    void 구간에_걸친_정지는_겹친_초만_센다() {
        jdbc.update("INSERT INTO downtime (equipment_id, started_at, last_seen_at, duration_sec, reason_code, reason_source) "
                + "VALUES ('CNC_01', now() - INTERVAL '61 minutes', now() - INTERVAL '58 minutes' - INTERVAL '1 second', 180, 'OTHER', 'MANUAL')");

        @SuppressWarnings("unchecked")
        Map<String, Object> summary = (Map<String, Object>) service.summary("1h").get("summary");

        // 1시간 구간 시작(60분 전)부터 58분 전까지: 약 120초(조회 시각 차이만큼 조금 짧을 수 있다)
        assertThat((long) summary.get("downSec")).isBetween(115L, 120L);
    }

    @Test
    void 사유를_넣거나_자동_사유를_고치면_작업자_입력이_되고_알람은_남는다() {
        down("CNC_01", 0, 61, "CNC_TOOL_BREAK");
        long id = jdbc.queryForObject("SELECT id FROM downtime", Long.class);

        Map<String, Object> changed = service.setReason(id, Map.of("reasonCode", "BREAKDOWN_MECH", "enteredBy", " 이현장 "));

        assertThat(changed).containsEntry("reasonCode", "BREAKDOWN_MECH").containsEntry("reasonName", "기계 고장")
                .containsEntry("reasonSource", "MANUAL").containsEntry("reasonBy", "이현장")
                .containsEntry("alarmCode", "CNC_TOOL_BREAK").containsEntry("alarmName", "공구 파손");
        assertThat(changed.get("reasonAt")).isNotNull();

        assertThatThrownBy(() -> service.setReason(id + 1, Map.of("reasonCode", "OTHER", "enteredBy", "이현장")))
                .isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> service.setReason(id, Map.of("reasonCode", "NO_SUCH", "enteredBy", "이현장")))
                .isInstanceOf(InvalidPayloadException.class).hasMessageContaining("reasonCode");
        assertThatThrownBy(() -> service.setReason(id, Map.of("reasonCode", "OTHER", "enteredBy", " ")))
                .isInstanceOf(InvalidPayloadException.class).hasMessageContaining("enteredBy");
        assertThatThrownBy(() -> service.setReason(id, null)).isInstanceOf(InvalidPayloadException.class);
    }
}
