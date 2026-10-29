package com.messtudy.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.messtudy.backend.mapper.DowntimeMapper;
import com.messtudy.backend.mapper.ProductionPerformanceMapper;
import com.messtudy.backend.mapper.StatusChangeMapper;

/** DB 없이 분리 · 변환 · 검증만 확인한다(매퍼는 받은 값을 기록만 하는 가짜). */
class SensorLogServiceTest {

    /** 스풀에 쓴(= 받은) 센서 값. 가짜 아카이브는 파일 대신 여기에 모은다 */
    private final List<SensorReading> insertedLogs = new ArrayList<>();
    private final List<Map<String, Object>> upsertedRows = new ArrayList<>();

    private final SensorArchive archive = new SensorArchive("build/unused-spool", "build/unused-archive") {
        @Override
        public synchronized void append(List<SensorReading> readings) {
            insertedLogs.addAll(readings);
        }
    };
    /** 상태 이력 매퍼에 넘긴 것("open 설비 상태" · "close 설비") */
    private final List<String> statusCalls = new ArrayList<>();
    private final StatusChangeMapper statusChangeMapper = new StatusChangeMapper() {
        @Override
        public void lockEquipment(String equipmentId) {
        }

        @Override
        public List<Map<String, Object>> findOpen() {
            return List.of();
        }

        @Override
        public int close(String equipmentId, OffsetDateTime endedAt) {
            statusCalls.add("close " + equipmentId);
            return 0;
        }

        @Override
        public int open(String equipmentId, String status, OffsetDateTime startedAt) {
            statusCalls.add("open " + equipmentId + " " + status);
            return 1;
        }

        @Override
        public List<Map<String, Object>> findSince(String equipmentId, OffsetDateTime from) {
            return List.of();
        }
    };
    private final List<Map<String, Object>> eventRows = new ArrayList<>();
    /** 매퍼를 부른 순서 */
    private final List<String> calls = new ArrayList<>();

    private final ProductionPerformanceMapper productionMapper = new ProductionPerformanceMapper() {
        @Override
        public int insertEvents(List<Map<String, Object>> rows) {
            calls.add("insertEvents");
            eventRows.addAll(rows);
            return rows.size();
        }

        @Override
        public int upsertAll(List<Map<String, Object>> rows) {
            calls.add("upsertAll");
            upsertedRows.addAll(rows);
            return rows.size();
        }

        @Override
        public int insertDefectEvents(List<Map<String, Object>> rows) {
            calls.add("insertDefectEvents");
            return rows.size();
        }

        @Override
        public int upsertDefects(List<Map<String, Object>> rows) {
            calls.add("upsertDefects");
            defectRows.addAll(rows);
            return rows.size();
        }
    };
    private final List<Map<String, Object>> defectRows = new ArrayList<>();
    /** 새로 만든 정지(DowntimeMapper.insert에 넘긴 행). 가짜는 마지막 정지가 늘 없다고 답한다 */
    private final List<Map<String, Object>> startedDowntimes = new ArrayList<>();
    private final DowntimeMapper downtimeMapper = new DowntimeMapper() {
        @Override
        public Map<String, Object> findLatest(String equipmentId) {
            return null;
        }

        @Override
        public int extend(long id, Object recordedAt) {
            throw new AssertionError("마지막 정지가 없으므로 이어 붙이지 않는다");
        }

        @Override
        public int insert(Map<String, Object> row) {
            startedDowntimes.add(row);
            return 1;
        }
    };
    private final SensorLogService service = new SensorLogService(productionMapper, downtimeMapper, statusChangeMapper,
            new SensorAggregator(), archive);

    /** 프론트가 보내는 것과 같은 모양의 항목(Jackson처럼 숫자는 Integer · Double) */
    private static Map<String, Object> item(String equipmentId, int totalCount) {
        Map<String, Object> item = new HashMap<>();
        item.put("equipmentId", equipmentId);
        item.put("timestamp", "2026-10-24T23:37:12.451Z");
        item.put("status", "RUN");
        item.put("workOrderId", "WO-20261024-001");
        item.put("metrics", new HashMap<>(Map.of("temperature", 82.4, "vibration", 1.2)));
        int badCount = Math.min(2, totalCount);
        item.put("production", new HashMap<>(Map.of("totalCount", totalCount, "goodCount", totalCount - badCount, "badCount", badCount)));
        return item;
    }

    @Test
    void metrics와_production을_나눠_변환해서_저장한다() {
        Map<String, Integer> result = service.save(List.of(item("CNC_01", 150), item("WINDER_01", 120)));

        assertThat(result).isEqualTo(Map.of("sensorLogs", 2, "productions", 2));
        assertThat(insertedLogs.get(0)).isEqualTo(new SensorReading("CNC_01", Instant.parse("2026-10-24T23:37:12.451Z"),
                "RUN", "WO-20261024-001", new BigDecimal("82.4"), new BigDecimal("1.2"), null));
        // 처음 받는 설비라 설비마다 상태 구간을 하나씩 연다
        assertThat(statusCalls).containsExactly("close CNC_01", "open CNC_01 RUN", "close WINDER_01", "open WINDER_01 RUN");
        assertThat(upsertedRows.get(0)).isEqualTo(Map.of(
                "workOrderId", "WO-20261024-001",
                "equipmentId", "CNC_01",
                "occurredAt", OffsetDateTime.parse("2026-10-24T23:37:12.451Z"),
                "totalCount", 150,
                "goodCount", 148,
                "badCount", 2));
    }

    @Test
    void 빈_배열이면_아무것도_저장하지_않는다() {
        assertThat(service.save(List.of())).isEqualTo(Map.of("sensorLogs", 0, "productions", 0));
        assertThat(service.save(null)).isEqualTo(Map.of("sensorLogs", 0, "productions", 0));
        assertThat(insertedLogs).isEmpty();
        assertThat(upsertedRows).isEmpty();
    }

    @Test
    void 같은_작업지시_장비가_두_번_오면_실적은_마지막_값만_남긴다() {
        service.save(List.of(item("CNC_01", 150), item("WINDER_01", 120), item("CNC_01", 151)));

        assertThat(insertedLogs).hasSize(2); // 같은 설비 · 같은 시각의 센서 값은 한 번만 받는다(재전송)
        assertThat(upsertedRows).hasSize(2);
        assertThat(upsertedRows.get(0)).containsEntry("equipmentId", "CNC_01").containsEntry("totalCount", 151);
    }

    @Test
    void 생산_이벤트는_실적을_갱신하기_전에_같은_행으로_만든다() {
        service.save(List.of(item("CNC_01", 150), item("WINDER_01", 120)));

        // 이벤트 SQL은 저장값(직전 누적)과 비교하므로 UPSERT보다 먼저여야 한다
        assertThat(calls).containsExactly("insertEvents", "upsertAll");
        assertThat(eventRows).isEqualTo(upsertedRows);
    }

    @Test
    void 작업지시가_없는_항목은_센서_로그만_저장한다() {
        Map<String, Object> idle = item("CNC_01", 0);
        idle.put("status", "IDLE");
        idle.remove("workOrderId");
        idle.remove("production");

        Map<String, Integer> result = service.save(List.of(idle, item("WINDER_01", 3)));

        assertThat(result).isEqualTo(Map.of("sensorLogs", 2, "productions", 1));
        assertThat(insertedLogs.get(0).status()).isEqualTo("IDLE");
        assertThat(insertedLogs.get(0).workOrderId()).isNull();
        assertThat(upsertedRows).extracting(row -> row.get("equipmentId")).containsExactly("WINDER_01");
    }

    @Test
    void 실적만_있고_작업지시_번호가_없으면_예외다() {
        Map<String, Object> noWorkOrder = item("CNC_01", 1);
        noWorkOrder.remove("workOrderId");

        assertInvalid(noWorkOrder, "[0].workOrderId");
    }

    @Test
    void 온도_진동이_없으면_null로_저장한다() {
        Map<String, Object> item = item("CNC_01", 1);
        item.put("metrics", new HashMap<>());

        service.save(List.of(item));

        assertThat(insertedLogs.get(0).temperature()).isNull();
        assertThat(insertedLogs.get(0).vibration()).isNull();
    }

    @Test
    void 필수_값이_없거나_형식이_틀리면_예외를_내고_저장하지_않는다() {
        Map<String, Object> noEquipment = item("CNC_01", 1);
        noEquipment.remove("equipmentId");
        assertInvalid(noEquipment, "[0].equipmentId");

        Map<String, Object> badTime = item("CNC_01", 1);
        badTime.put("timestamp", "어제");
        assertInvalid(badTime, "[0].timestamp");

        Map<String, Object> noProduction = item("CNC_01", 1);
        noProduction.remove("production");
        assertInvalid(noProduction, "[0].production");

        Map<String, Object> textTemperature = item("CNC_01", 1);
        textTemperature.put("metrics", new HashMap<>(Map.of("temperature", "뜨거움")));
        assertInvalid(textTemperature, "[0].metrics.temperature");

        Map<String, Object> negativeCount = item("CNC_01", 1);
        negativeCount.put("production", new HashMap<>(Map.of("totalCount", -1, "goodCount", 0, "badCount", 0)));
        assertInvalid(negativeCount, "[0].production.totalCount");

        Map<String, Object> fractionalCount = item("CNC_01", 1);
        fractionalCount.put("production", new HashMap<>(Map.of("totalCount", 1.5, "goodCount", 0, "badCount", 0)));
        assertInvalid(fractionalCount, "[0].production.totalCount");

        assertThat(insertedLogs).isEmpty();
        assertThat(upsertedRows).isEmpty();
    }

    @Test
    void 뒤쪽_항목이_틀려도_앞쪽_항목까지_저장하지_않는다() {
        Map<String, Object> broken = item("WINDER_01", 1);
        broken.remove("status");

        assertThatThrownBy(() -> service.save(List.of(item("CNC_01", 1), broken)))
                .isInstanceOf(InvalidPayloadException.class)
                .hasMessageContaining("[1].status");
        assertThat(insertedLogs).isEmpty();
    }

    /** CNC 실적 3개 중 불량 2개, 유형별 누적을 함께 보낸다 */
    private static Map<String, Object> withDefects(Map<String, Object> defects) {
        Map<String, Object> item = item("CNC_01", 3);
        @SuppressWarnings("unchecked")
        Map<String, Object> production = (Map<String, Object>) item.get("production");
        production.put("defects", defects);
        return item;
    }

    @Test
    void 유형별_불량은_유형마다_한_행으로_실적_뒤에_저장한다() {
        service.save(List.of(withDefects(new HashMap<>(Map.of("MACHINING_DIMENSION", 1, "MACHINING_SURFACE", 1)))));

        assertThat(calls).containsExactly("insertEvents", "upsertAll", "insertDefectEvents", "upsertDefects");
        assertThat(defectRows).extracting(row -> row.get("defectCode") + "=" + row.get("defectCount"))
                .containsExactlyInAnyOrder("MACHINING_DIMENSION=1", "MACHINING_SURFACE=1");
        assertThat(defectRows.get(0)).containsEntry("workOrderId", "WO-20261024-001").containsEntry("equipmentId", "CNC_01")
                .containsEntry("occurredAt", OffsetDateTime.parse("2026-10-24T23:37:12.451Z"));
    }

    @Test
    void 유형별_불량이_없으면_불량_저장을_부르지_않는다() {
        service.save(List.of(item("CNC_01", 3)));                       // defects 없음(이전 시뮬레이터)
        service.save(List.of(withDefects(new HashMap<>())));          // 빈 객체

        assertThat(calls).doesNotContain("insertDefectEvents", "upsertDefects");
    }

    @Test
    void 유형별_합이_불량_수보다_적은_것은_미분류로_허용한다() {
        service.save(List.of(withDefects(new HashMap<>(Map.of("MACHINING_DIMENSION", 1)))));

        assertThat(defectRows).hasSize(1);
    }

    @Test
    void 유형별_불량_값이_틀리면_예외를_내고_저장하지_않는다() {
        assertInvalid(withDefects(new HashMap<>(Map.of("MACHINING_DIMENSION", 3))), "[0].production.defects: 유형별 합(3)");
        assertInvalid(withDefects(new HashMap<>(Map.of("MACHINING_DIMENSION", -1))), "[0].production.defects.MACHINING_DIMENSION");
        assertInvalid(withDefects(new HashMap<>(Map.of("MACHINING_DIMENSION", 0.5))), "[0].production.defects.MACHINING_DIMENSION");
        assertInvalid(withDefects(new HashMap<>(Map.of(" ", 1))), "[0].production.defects: 빈 유형 코드");
        Map<String, Object> notObject = item("CNC_01", 3);
        @SuppressWarnings("unchecked")
        Map<String, Object> production = (Map<String, Object>) notObject.get("production");
        production.put("defects", List.of("MACHINING_DIMENSION"));
        assertInvalid(notObject, "[0].production.defects");

        assertThat(insertedLogs).isEmpty();
        assertThat(defectRows).isEmpty();
    }

    private void assertInvalid(Map<String, Object> item, String expectedPath) {
        assertThatThrownBy(() -> service.save(List.of(item)))
                .isInstanceOf(InvalidPayloadException.class)
                .hasMessageContaining(expectedPath);
    }

    @Test
    void 고장_행만_정지로_넘기고_알람_코드를_붙인다() {
        Map<String, Object> down = item("CNC_01", 3);
        down.put("status", "DOWN");
        down.put("alarmCode", "CNC_TOOL_BREAK");
        Map<String, Object> quietDown = item("WINDER_01", 3);
        quietDown.put("status", "DOWN");

        service.save(List.of(item("ASSEMBLY_01", 3), down, quietDown));

        assertThat(startedDowntimes).extracting(row -> row.get("equipmentId")).containsExactly("CNC_01", "WINDER_01");
        assertThat(startedDowntimes.get(0)).containsEntry("alarmCode", "CNC_TOOL_BREAK")
                .containsEntry("workOrderId", "WO-20261024-001")
                .containsEntry("recordedAt", OffsetDateTime.parse("2026-10-24T23:37:12.451Z"));
        assertThat(startedDowntimes.get(1)).containsEntry("alarmCode", null);
        // 원본(스풀 → Parquet)에는 알람도 남긴다. 받은 값은 설비 이름 순서다
        assertThat(insertedLogs).extracting(SensorReading::alarmCode).containsExactly(null, "CNC_TOOL_BREAK", null);
    }

    @Test
    void 고장이_아닌_행에_알람_코드가_있으면_예외다() {
        Map<String, Object> run = item("CNC_01", 3);
        run.put("alarmCode", "CNC_TOOL_BREAK");
        Map<String, Object> notText = item("CNC_01", 3);
        notText.put("status", "DOWN");
        notText.put("alarmCode", 7);

        assertThatThrownBy(() -> service.save(List.of(run))).isInstanceOf(InvalidPayloadException.class)
                .hasMessageContaining("[0].alarmCode: 고장(DOWN)일 때만");
        assertThatThrownBy(() -> service.save(List.of(notText))).isInstanceOf(InvalidPayloadException.class)
                .hasMessageContaining("[0].alarmCode");
        assertThat(insertedLogs).isEmpty();
    }

    @Test
    void 마지막_정지에서_5초_안이고_알람이_같으면_이어_붙인다() {
        Instant last = Instant.parse("2026-10-24T23:37:12Z");
        Map<String, Object> latest = new HashMap<>(Map.of("lastSeenAt", OffsetDateTime.parse("2026-10-24T23:37:12Z")));
        latest.put("alarmCode", null);

        assertThat(SensorLogService.downtimeAction(null, last, null)).isEqualTo(SensorLogService.DowntimeAction.START);
        assertThat(SensorLogService.downtimeAction(latest, last.plusSeconds(1), null)).isEqualTo(SensorLogService.DowntimeAction.EXTEND);
        assertThat(SensorLogService.downtimeAction(latest, last.plusSeconds(5), null)).isEqualTo(SensorLogService.DowntimeAction.EXTEND);
        assertThat(SensorLogService.downtimeAction(latest, last.plusSeconds(6), null)).isEqualTo(SensorLogService.DowntimeAction.START);
        assertThat(SensorLogService.downtimeAction(latest, last.plusSeconds(1), "CNC_TOOL_BREAK")).isEqualTo(SensorLogService.DowntimeAction.START);
        // 같은 요청이 다시 왔거나 늦게 온 옛 요청
        assertThat(SensorLogService.downtimeAction(latest, last, null)).isEqualTo(SensorLogService.DowntimeAction.SKIP);
        assertThat(SensorLogService.downtimeAction(latest, last.minusSeconds(3), null)).isEqualTo(SensorLogService.DowntimeAction.SKIP);
    }
}
