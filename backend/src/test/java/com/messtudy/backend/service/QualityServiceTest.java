package com.messtudy.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.offset;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

/** DB 없이 품질 비율 계산(직행률 · 양품률 · 파레토)만 확인한다. */
class QualityServiceTest {

    private static final List<Map<String, Object>> EQUIPMENT = List.of(
            Map.of("equipmentId", "CNC_01", "equipmentName", "CNC #1", "lineOrder", 1),
            Map.of("equipmentId", "ASSEMBLY_01", "equipmentName", "조립 셀 #1", "lineOrder", 2),
            Map.of("equipmentId", "PACKER_01", "equipmentName", "포장기 #1", "lineOrder", 3));

    private static Map<String, Object> counts(String id, long good, long bad) {
        return Map.of("equipmentId", id, "goodCount", good, "badCount", bad);
    }

    private static Map<String, Object> defect(String code, long count) {
        return Map.of("defectCode", code, "defectName", code, "equipmentId", "CNC_01", "equipmentName", "CNC #1", "count", count);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> summary(Map<String, Object> result) {
        return (Map<String, Object>) result.get("summary");
    }

    @Test
    void 직행률은_공정별_합격률의_곱이고_양품률은_결과가_정해진_것_중_완성품_비율이다() {
        Map<String, Object> result = QualityService.calculate(EQUIPMENT,
                List.of(counts("CNC_01", 9, 1), counts("ASSEMBLY_01", 8, 2), counts("PACKER_01", 5, 0)), List.of());

        // 0.9 × 0.8 × 1.0
        assertThat((double) summary(result).get("fpy")).isCloseTo(0.72, offset(1e-9));
        // 완성품 5 ÷ (5 + 불량 3)
        assertThat(summary(result)).containsEntry("yield", 5.0 / 8).containsEntry("badCount", 3L).containsEntry("finishedCount", 5L);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) result.get("equipment");
        assertThat(rows.get(1)).containsEntry("totalCount", 10L).containsEntry("passRate", 0.8);
    }

    @Test
    void 생산이_없는_공정은_직행률_곱에서_빼고_모두_없으면_null이다() {
        Map<String, Object> partial = QualityService.calculate(EQUIPMENT, List.of(counts("CNC_01", 3, 1)), List.of());
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) partial.get("equipment");

        assertThat(summary(partial)).containsEntry("fpy", 0.75).containsEntry("yield", 0.0);
        assertThat(rows.get(2)).containsEntry("passRate", null);

        Map<String, Object> empty = QualityService.calculate(EQUIPMENT, List.of(), List.of());
        assertThat(summary(empty)).containsEntry("fpy", null).containsEntry("yield", null).containsEntry("badCount", 0L);
    }

    @Test
    void 파레토는_누적_비율을_붙이고_미분류를_맨_뒤에_둔다() {
        List<Map<String, Object>> rows = QualityService.pareto(List.of(defect("A", 3), defect("B", 1)), 8);

        assertThat(rows).extracting(r -> r.get("defectName") + ":" + r.get("count") + ":" + r.get("cumulativeRatio"))
                .containsExactly("A:3:0.375", "B:1:0.5", "미분류:4:1.0");
        assertThat(rows.get(2)).containsEntry("defectCode", null);
    }

    @Test
    void 유형이_모두_있으면_미분류가_없고_불량이_없으면_파레토가_비어_있다() {
        assertThat(QualityService.pareto(List.of(defect("A", 2)), 2)).extracting(r -> r.get("defectName")).containsExactly("A");
        assertThat(QualityService.pareto(List.of(), 0)).isEmpty();
    }
}
