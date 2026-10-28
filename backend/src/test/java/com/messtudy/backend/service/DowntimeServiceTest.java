package com.messtudy.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

/** DB 없이 비가동 파레토 정렬 · 누적 비율 · 요약만 확인한다. */
class DowntimeServiceTest {

    private static Map<String, Object> kind(String kind, String code, int order, long seconds, long count) {
        Map<String, Object> row = new HashMap<>();
        row.put("kind", kind);
        row.put("reasonCode", code);
        row.put("reasonName", code == null ? null : code + " 이름");
        row.put("category", code == null ? null : "설비 고장");
        row.put("displayOrder", code == null ? null : order);
        row.put("seconds", seconds);
        row.put("count", count);
        return row;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> reasons(Map<String, Object> result) {
        return (List<Map<String, Object>>) result.get("reasons");
    }

    @Test
    void 사유는_시간_많은_순이고_그_뒤에_사유_미입력_맨_뒤에_순간_정지다() {
        // 순간 정지 · 미입력이 사유보다 길어도 뒤에 둔다
        Map<String, Object> result = DowntimeService.calculate(List.of(
                kind("MICRO", null, 0, 500, 40),
                kind("REASON", "TOOL_JIG", 3, 100, 1),
                kind("PENDING", null, 0, 300, 2),
                kind("REASON", "BREAKDOWN_MECH", 1, 200, 2),
                kind("REASON", "OTHER", 10, 100, 1)));

        assertThat(reasons(result)).extracting(r -> r.get("reasonName"))
                .containsExactly("BREAKDOWN_MECH 이름", "TOOL_JIG 이름", "OTHER 이름", "사유 미입력", "순간 정지");
        assertThat(reasons(result)).extracting(r -> r.get("cumulativeRatio"))
                .containsExactly(200.0 / 1200, 300.0 / 1200, 400.0 / 1200, 700.0 / 1200, 1.0);
        assertThat(reasons(result).get(3)).containsEntry("reasonCode", null).containsEntry("kind", "PENDING")
                .doesNotContainKey("displayOrder");
    }

    @Test
    @SuppressWarnings("unchecked")
    void 요약은_정지_시간_합과_60초_이상_정지_수를_낸다() {
        Map<String, Object> result = DowntimeService.calculate(List.of(
                kind("REASON", "TOOL_JIG", 3, 100, 1),
                kind("PENDING", null, 0, 300, 2),
                kind("MICRO", null, 0, 20, 5)));

        assertThat((Map<String, Object>) result.get("summary")).containsEntry("downSec", 420L).containsEntry("stopCount", 3L)
                .containsEntry("pendingCount", 2L).containsEntry("pendingSec", 300L).containsEntry("microSec", 20L)
                .containsEntry("reasonSec", 100L);
    }

    @Test
    @SuppressWarnings("unchecked")
    void 정지가_없으면_파레토가_비고_비율은_없다() {
        Map<String, Object> result = DowntimeService.calculate(List.of());

        assertThat(reasons(result)).isEmpty();
        assertThat((Map<String, Object>) result.get("summary")).containsEntry("downSec", 0L).containsEntry("stopCount", 0L)
                .containsEntry("pendingCount", 0L).containsEntry("microSec", 0L);
    }
}
