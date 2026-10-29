package com.messtudy.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

/** DB 없이 메모리 1분 요약 · 상태 구간 · 최근 10분 규칙을 확인한다. */
class SensorAggregatorTest {

    private static final Instant T0 = Instant.parse("2026-10-28T05:00:00Z");

    private final SensorAggregator aggregator = new SensorAggregator();

    private static SensorReading reading(String equipmentId, int second, String status, String workOrderId, String temperature) {
        return new SensorReading(equipmentId, T0.plusSeconds(second), status, workOrderId,
                temperature == null ? null : new BigDecimal(temperature), new BigDecimal("1.00"), null);
    }

    private static Map<String, Object> only(List<Map<String, Object>> rows) {
        assertThat(rows).hasSize(1);
        return rows.get(0);
    }

    @Test
    void 한_분의_평균_최대_최소와_상태별_초를_모은다() {
        aggregator.accept(List.of(
                reading("CNC_01", 0, "RUN", "WO-1", "60.00"),
                reading("CNC_01", 1, "RUN", "WO-1", "64.00"),
                reading("CNC_01", 2, "DOWN", "WO-1", null),   // 온도 없음: 평균 · 최소 · 최대에서 빠진다
                reading("CNC_01", 3, "WARN", "WO-1", "80.00")));

        Map<String, Object> row = only(aggregator.pendingRows());

        assertThat(row).containsEntry("sampleCount", 4).containsEntry("temperatureCount", 3)
                .containsEntry("runSec", 2).containsEntry("downSec", 1).containsEntry("warnSec", 1).containsEntry("idleSec", 0)
                .containsEntry("lastStatus", "WARN").containsEntry("workOrderId", "WO-1");
        assertThat((BigDecimal) row.get("temperatureSum")).isEqualByComparingTo("204.00");
        assertThat((BigDecimal) row.get("temperatureMin")).isEqualByComparingTo("60.00");
        assertThat((BigDecimal) row.get("temperatureMax")).isEqualByComparingTo("80.00");
        assertThat((BigDecimal) row.get("lastTemperature")).isEqualByComparingTo("80.00");
    }

    @Test
    void 분이_바뀌거나_작업지시가_바뀌면_버킷을_나눈다() {
        aggregator.accept(List.of(
                reading("CNC_01", 58, "RUN", "WO-1", "60"),
                reading("CNC_01", 59, "RUN", "WO-2", "60"),    // 같은 분, 다른 작업지시
                reading("CNC_01", 60, "IDLE", null, "40")));   // 다음 분, 지시 없음 → ""

        assertThat(aggregator.pendingRows())
                .extracting(r -> ((OffsetDateTime) r.get("bucketStart")).toInstant() + " " + r.get("workOrderId"))
                .containsExactlyInAnyOrder(T0 + " WO-1", T0 + " WO-2", T0.plusSeconds(60) + " ");
    }

    @Test
    void 끝난_지_grace가_지난_분만_꺼내고_꺼낸_버킷은_메모리에서_지운다() {
        aggregator.accept(List.of(reading("CNC_01", 10, "RUN", null, "60"), reading("CNC_01", 70, "RUN", null, "60")));
        Duration grace = Duration.ofSeconds(5);

        assertThat(aggregator.drainClosed(T0.plusSeconds(64), grace)).isEmpty();   // 첫 분 끝 + 4초
        assertThat(aggregator.drainClosed(T0.plusSeconds(65), grace)).hasSize(1);  // 첫 분 끝 + 5초
        assertThat(aggregator.pendingRows()).extracting(r -> r.get("bucketStart"))
                .containsExactly(OffsetDateTime.parse("2026-10-28T05:01:00Z"));
        assertThat(aggregator.drainAll()).hasSize(1);
        assertThat(aggregator.pendingRows()).isEmpty();
    }

    @Test
    void 돌려놓은_행은_같은_키의_버킷과_합친다() {
        aggregator.accept(List.of(reading("CNC_01", 0, "RUN", null, "60.00")));
        List<Map<String, Object>> drained = aggregator.drainAll();
        aggregator.accept(List.of(reading("CNC_01", 1, "DOWN", null, "70.00")));

        aggregator.putBack(drained);

        Map<String, Object> row = only(aggregator.pendingRows());
        assertThat(row).containsEntry("sampleCount", 2).containsEntry("runSec", 1).containsEntry("downSec", 1)
                .containsEntry("lastStatus", "DOWN");
        assertThat((BigDecimal) row.get("temperatureSum")).isEqualByComparingTo("130.00");
    }

    @Test
    void 상태가_바뀌거나_5초_넘게_끊기면_새_구간이다() {
        SensorAggregator.Tracker none = null;
        SensorReading first = reading("CNC_01", 0, "RUN", null, "60");
        assertThat(SensorAggregator.Tracker.startsSegment(none, first)).isTrue();
        SensorAggregator.Tracker t = SensorAggregator.Tracker.next(none, first);

        SensorReading same = reading("CNC_01", 5, "RUN", null, "60");     // 5초 뒤: 이어진다
        assertThat(SensorAggregator.Tracker.startsSegment(t, same)).isFalse();
        t = SensorAggregator.Tracker.next(t, same);
        assertThat(t.since()).isEqualTo(T0);

        SensorReading changed = reading("CNC_01", 6, "WARN", null, "60");
        assertThat(SensorAggregator.Tracker.startsSegment(t, changed)).isTrue();
        assertThat(SensorAggregator.Tracker.endOf(t, changed)).isEqualTo(T0.plusSeconds(6));

        SensorReading afterGap = reading("CNC_01", 11, "RUN", null, "60");  // 6초 끊김: 같은 상태여도 새 구간
        assertThat(SensorAggregator.Tracker.startsSegment(t, afterGap)).isTrue();
        assertThat(SensorAggregator.Tracker.endOf(t, afterGap)).isEqualTo(T0.plusSeconds(6)); // 마지막 5초 + 1초
    }

    @Test
    void 최근_10분만_남기고_설비마다_마지막_값을_돌려준다() {
        aggregator.accept(List.of(
                reading("CNC_01", 0, "RUN", null, "60"),
                reading("CNC_01", 300, "RUN", null, "61"),
                reading("CNC_01", 601, "WARN", null, "80"),   // 0초는 10분 밖으로 밀려난다
                reading("WINDER_01", 5, "IDLE", null, "40")));

        assertThat(aggregator.recent("CNC_01", Instant.EPOCH)).extracting(SensorReading::recordedAt)
                .containsExactly(T0.plusSeconds(300), T0.plusSeconds(601));
        assertThat(aggregator.recent("CNC_01", T0.plusSeconds(400))).hasSize(1);
        assertThat(aggregator.latest()).containsOnlyKeys("CNC_01", "WINDER_01");
        assertThat(aggregator.latest().get("CNC_01").status()).isEqualTo("WARN");
        assertThat(aggregator.tracker("CNC_01").lastSeen()).isEqualTo(T0.plusSeconds(601));
    }
}
