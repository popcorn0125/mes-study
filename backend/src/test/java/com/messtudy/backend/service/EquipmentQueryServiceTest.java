package com.messtudy.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.messtudy.backend.mapper.SensorLogQueryMapper;

/** DB 없이 조회 기간 검사와 매퍼 전달만 확인한다(매퍼는 받은 인자를 기록만 하는 가짜). */
class EquipmentQueryServiceTest {

    /** 가짜 매퍼가 받은 호출 기록: "메서드 이름 equipmentId minutes" */
    private final List<String> calls = new ArrayList<>();

    private final SensorLogQueryMapper mapper = new SensorLogQueryMapper() {
        @Override
        public List<Map<String, Object>> findLatestPerEquipment() {
            calls.add("latest");
            return List.of();
        }

        @Override
        public List<Map<String, Object>> findRecentLogs(String equipmentId, int minutes) {
            calls.add("recent " + equipmentId + " " + minutes);
            return List.of();
        }

        @Override
        public List<Map<String, Object>> countStatusSeconds(int minutes) {
            calls.add("summary " + minutes);
            return List.of();
        }

        @Override
        public List<Map<String, Object>> findStatusChanges(String equipmentId, int minutes) {
            calls.add("changes " + equipmentId + " " + minutes);
            return List.of();
        }
    };

    private final EquipmentQueryService service = new EquipmentQueryService(mapper);

    @Test
    void 허용_범위의_기간은_그대로_매퍼에_넘긴다() {
        service.findLatest();
        service.findRecentLogs("CNC_01", 1);
        service.countStatusSeconds(1440);
        service.findStatusChanges("WINDER_01", 60);

        assertThat(calls).containsExactly("latest", "recent CNC_01 1", "summary 1440", "changes WINDER_01 60");
    }

    @Test
    void 기간이_1분보다_짧거나_하루보다_길면_예외를_내고_조회하지_않는다() {
        assertThatThrownBy(() -> service.findRecentLogs("CNC_01", 0))
                .isInstanceOf(InvalidPayloadException.class)
                .hasMessageContaining("minutes");
        assertThatThrownBy(() -> service.countStatusSeconds(1441))
                .isInstanceOf(InvalidPayloadException.class);
        assertThatThrownBy(() -> service.findStatusChanges("CNC_01", -5))
                .isInstanceOf(InvalidPayloadException.class);

        assertThat(calls).isEmpty();
    }
}
