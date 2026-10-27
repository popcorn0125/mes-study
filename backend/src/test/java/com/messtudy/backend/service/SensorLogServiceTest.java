package com.messtudy.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.messtudy.backend.mapper.ProductionPerformanceMapper;
import com.messtudy.backend.mapper.SensorLogMapper;

/** DB 없이 분리 · 변환 · 검증만 확인한다(매퍼는 받은 값을 기록만 하는 가짜). */
class SensorLogServiceTest {

    private final List<Map<String, Object>> insertedLogs = new ArrayList<>();
    private final List<Map<String, Object>> upsertedRows = new ArrayList<>();

    private final SensorLogMapper sensorLogMapper = logs -> {
        insertedLogs.addAll(logs);
        return logs.size();
    };
    private final ProductionPerformanceMapper productionMapper = rows -> {
        upsertedRows.addAll(rows);
        return rows.size();
    };
    private final SensorLogService service = new SensorLogService(sensorLogMapper, productionMapper);

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
        assertThat(insertedLogs.get(0)).isEqualTo(Map.of(
                "equipmentId", "CNC_01",
                "recordedAt", OffsetDateTime.parse("2026-10-24T23:37:12.451Z"),
                "status", "RUN",
                "temperature", new BigDecimal("82.4"),
                "vibration", new BigDecimal("1.2")));
        assertThat(upsertedRows.get(0)).isEqualTo(Map.of(
                "workOrderId", "WO-20261024-001",
                "equipmentId", "CNC_01",
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

        assertThat(insertedLogs).hasSize(3); // 센서 로그는 시계열이라 모두 남긴다
        assertThat(upsertedRows).hasSize(2);
        assertThat(upsertedRows.get(0)).containsEntry("equipmentId", "CNC_01").containsEntry("totalCount", 151);
    }

    @Test
    void 작업지시가_없는_항목은_센서_로그만_저장한다() {
        Map<String, Object> idle = item("CNC_01", 0);
        idle.put("status", "IDLE");
        idle.remove("workOrderId");
        idle.remove("production");

        Map<String, Integer> result = service.save(List.of(idle, item("WINDER_01", 3)));

        assertThat(result).isEqualTo(Map.of("sensorLogs", 2, "productions", 1));
        assertThat(insertedLogs.get(0)).containsEntry("status", "IDLE");
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

        assertThat(insertedLogs.get(0)).containsEntry("temperature", null).containsEntry("vibration", null);
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

    private void assertInvalid(Map<String, Object> item, String expectedPath) {
        assertThatThrownBy(() -> service.save(List.of(item)))
                .isInstanceOf(InvalidPayloadException.class)
                .hasMessageContaining(expectedPath);
    }
}
