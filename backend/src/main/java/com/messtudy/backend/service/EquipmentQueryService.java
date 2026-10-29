package com.messtudy.backend.service;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;


/**
 * 설비 관리 화면이 쓰는 센서 조회. 원본은 DB에 없으므로 메모리(최근 10분) · 1분 요약 · 상태 이력에서 읽는다(SensorRollupService).
 * 조회 기간(분)은 1분 ~ 1440분(하루)만 받는다.
 */
@Service
public class EquipmentQueryService {

    static final int MIN_MINUTES = 1;
    static final int MAX_MINUTES = 1440;

    private final SensorRollupService sensorRollupService;

    public EquipmentQueryService(SensorRollupService sensorRollupService) {
        this.sensorRollupService = sensorRollupService;
    }

    /** 장비마다 가장 최근 로그 1건(현재 상태 · 온도 · 진동) */
    public List<Map<String, Object>> findLatest() {
        return sensorRollupService.latest();
    }

    /**
     * 장비 하나의 최근 n분 로그를 시간순으로 돌려준다(10분 이하는 1초 원본, 넘으면 1분마다 평균 1점).
     *
     * @throws InvalidPayloadException minutes가 1~1440 밖일 때
     */
    public List<Map<String, Object>> findRecentLogs(String equipmentId, int minutes) {
        return sensorRollupService.recentLogs(equipmentId, requireMinutes(minutes));
    }

    /**
     * 최근 n분 동안 장비 · 상태별로 머문 초를 돌려준다.
     *
     * @throws InvalidPayloadException minutes가 1~1440 밖일 때
     */
    public List<Map<String, Object>> countStatusSeconds(int minutes) {
        return sensorRollupService.statusSeconds(requireMinutes(minutes));
    }

    /**
     * 장비 하나의 최근 n분 상태 변경 구간을 최신 구간부터 돌려준다.
     *
     * @throws InvalidPayloadException minutes가 1~1440 밖일 때
     */
    public List<Map<String, Object>> findStatusChanges(String equipmentId, int minutes) {
        return sensorRollupService.statusChanges(equipmentId, requireMinutes(minutes));
    }

    /** 조회 기간이 허용 범위 안인지 확인하고 그대로 돌려준다. 벗어나면 400으로 응답하게 예외를 낸다. */
    private static int requireMinutes(int minutes) {
        if (minutes < MIN_MINUTES || minutes > MAX_MINUTES) {
            throw new InvalidPayloadException("minutes: " + MIN_MINUTES + " ~ " + MAX_MINUTES + " 사이여야 합니다(" + minutes + ")");
        }
        return minutes;
    }
}
