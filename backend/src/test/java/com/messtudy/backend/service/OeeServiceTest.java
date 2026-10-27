package com.messtudy.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

/** DB 없이 OEE 비율 계산과 조회 구간만 확인한다. */
class OeeServiceTest {

    /** 설비 3대: 가공(45초) → 조립(50초, 병목) → 포장(25초) */
    private static final List<Map<String, Object>> EQUIPMENT = List.of(
            Map.of("equipmentId", "CNC_01", "equipmentName", "CNC #1", "lineOrder", 1, "standardTactSec", 45),
            Map.of("equipmentId", "ASSEMBLY_01", "equipmentName", "조립 셀 #1", "lineOrder", 2, "standardTactSec", 50),
            Map.of("equipmentId", "PACKER_01", "equipmentName", "포장기 #1", "lineOrder", 3, "standardTactSec", 25));

    private static Map<String, Object> seconds(String id, long planned, long run, long down, long idle) {
        return Map.of("equipmentId", id, "plannedSec", planned, "runSec", run, "downSec", down, "idleSec", idle);
    }

    private static Map<String, Object> counts(String id, long good, long bad) {
        return Map.of("equipmentId", id, "goodCount", good, "badCount", bad);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> row(Map<String, Object> result, String id) {
        return ((List<Map<String, Object>>) result.get("equipment")).stream()
                .filter(r -> r.get("equipmentId").equals(id)).findFirst().orElseThrow();
    }

    @Test
    void 설비_OEE는_가동률_성능_품질의_곱이고_손실을_초로_나눈다() {
        // 계획 1000초 중 가동 900 · 고장 40 · 대기 60, 20개(양품 18 · 불량 2) × 45초 = 900초
        Map<String, Object> result = OeeService.calculate(EQUIPMENT,
                List.of(seconds("CNC_01", 1000, 900, 40, 60)), List.of(counts("CNC_01", 18, 2)));
        Map<String, Object> cnc = row(result, "CNC_01");

        assertThat((double) cnc.get("availability")).isEqualTo(0.9);
        assertThat((double) cnc.get("performance")).isEqualTo(1.0);
        assertThat((double) cnc.get("quality")).isEqualTo(0.9);
        assertThat((double) cnc.get("oee")).isCloseTo(0.81, within(1e-9));
        assertThat(cnc.get("loss")).isEqualTo(Map.of("downSec", 40L, "idleSec", 60L, "speedSec", 0L, "defectSec", 90L));
    }

    @Test
    void 느리게_가공하면_성능이_떨어지고_속도_저하_손실이_남는다() {
        // 가동 1000초에 20개 × 45초 = 900초분만 만들었다
        Map<String, Object> cnc = row(OeeService.calculate(EQUIPMENT,
                List.of(seconds("CNC_01", 1000, 1000, 0, 0)), List.of(counts("CNC_01", 20, 0))), "CNC_01");

        assertThat((double) cnc.get("performance")).isEqualTo(0.9);
        assertThat(((Map<?, ?>) cnc.get("loss")).get("speedSec")).isEqualTo(100L);
    }

    @Test
    void 분모가_0이면_null이고_성능은_100퍼센트를_넘지_않는다() {
        Map<String, Object> result = OeeService.calculate(EQUIPMENT,
                List.of(seconds("CNC_01", 100, 40, 0, 60)), List.of(counts("CNC_01", 1, 0)));

        // 가동 40초에 45초짜리 1개(구간 직전에 시작한 1개) → 112%가 아니라 100%
        assertThat(row(result, "CNC_01").get("performance")).isEqualTo(1.0);
        // 로그가 없는 설비는 모두 null
        assertThat(row(result, "PACKER_01")).containsEntry("availability", null).containsEntry("performance", null)
                .containsEntry("quality", null).containsEntry("oee", null).containsEntry("plannedSec", 0L);
        assertThat(OeeService.ratio(0, 0)).isNull();
    }

    @Test
    void 라인_OEE는_포장_양품_곱하기_병목_택트_나누기_계획_시간이다() {
        Map<String, Object> line = OeeService.line(EQUIPMENT,
                List.of(seconds("CNC_01", 1000, 900, 0, 100), seconds("PACKER_01", 1000, 400, 0, 600)),
                List.of(counts("CNC_01", 20, 1), counts("PACKER_01", 16, 0)));

        assertThat(line).containsEntry("plannedSec", 1000L).containsEntry("goodCount", 16L)
                .containsEntry("bottleneckEquipmentId", "ASSEMBLY_01").containsEntry("bottleneckTactSec", 50L);
        assertThat((double) line.get("oee")).isEqualTo(0.8); // 16 × 50 ÷ 1000
        assertThat(OeeService.line(EQUIPMENT, List.of(), List.of()).get("oee")).isNull();
    }

    @Test
    void 조회_구간은_오늘_1시간_8시간만_받는다() {
        OffsetDateTime now = OffsetDateTime.parse("2026-10-28T03:12:40+09:00");

        assertThat(OeeService.Range.of("today").from(now)).isEqualTo(OffsetDateTime.parse("2026-10-28T00:00:00+09:00"));
        // 서울 자정이 지나 UTC로는 아직 전날이어도 서울 기준 오늘이다
        assertThat(OeeService.Range.of("today").from(OffsetDateTime.parse("2026-10-27T15:30:00Z")))
                .isEqualTo(OffsetDateTime.parse("2026-10-28T00:00:00+09:00"));
        assertThat(OeeService.Range.of("1h").from(now)).isEqualTo(now.minusHours(1));
        assertThat(OeeService.Range.of("1h").bucketSec).isEqualTo(300);
        assertThat(OeeService.Range.of("8h").bucketSec).isEqualTo(3600);
        assertThatThrownBy(() -> OeeService.Range.of("24h")).isInstanceOf(InvalidPayloadException.class)
                .hasMessageContaining("range");
    }
}
