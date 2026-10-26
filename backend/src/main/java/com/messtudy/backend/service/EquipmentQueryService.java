package com.messtudy.backend.service;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.messtudy.backend.mapper.SensorLogQueryMapper;

/**
 * 설비 관리 화면이 쓰는 센서 로그 조회.
 * 조회 기간(분)은 1분 ~ 1440분(하루)만 받는다. 너무 긴 기간은 로그를 너무 많이 읽기 때문이다.
 */
@Service
public class EquipmentQueryService {

    static final int MIN_MINUTES = 1;
    static final int MAX_MINUTES = 1440;

    private final SensorLogQueryMapper sensorLogQueryMapper;

    public EquipmentQueryService(SensorLogQueryMapper sensorLogQueryMapper) {
        this.sensorLogQueryMapper = sensorLogQueryMapper;
    }

    /** 장비마다 가장 최근 로그 1건(현재 상태 · 온도 · 진동) */
    public List<Map<String, Object>> findLatest() {
        return sensorLogQueryMapper.findLatestPerEquipment();
    }

    /**
     * 장비 하나의 최근 n분 로그를 시간순으로 돌려준다.
     *
     * @throws InvalidPayloadException minutes가 1~1440 밖일 때
     */
    public List<Map<String, Object>> findRecentLogs(String equipmentId, int minutes) {
        return sensorLogQueryMapper.findRecentLogs(equipmentId, requireMinutes(minutes));
    }

    /**
     * 최근 n분 동안 장비 · 상태별로 머문 초를 돌려준다.
     *
     * @throws InvalidPayloadException minutes가 1~1440 밖일 때
     */
    public List<Map<String, Object>> countStatusSeconds(int minutes) {
        return sensorLogQueryMapper.countStatusSeconds(requireMinutes(minutes));
    }

    /**
     * 장비 하나의 최근 n분 상태 변경 구간을 최신 구간부터 돌려준다.
     *
     * @throws InvalidPayloadException minutes가 1~1440 밖일 때
     */
    public List<Map<String, Object>> findStatusChanges(String equipmentId, int minutes) {
        return sensorLogQueryMapper.findStatusChanges(equipmentId, requireMinutes(minutes));
    }

    /** 조회 기간이 허용 범위 안인지 확인하고 그대로 돌려준다. 벗어나면 400으로 응답하게 예외를 낸다. */
    private static int requireMinutes(int minutes) {
        if (minutes < MIN_MINUTES || minutes > MAX_MINUTES) {
            throw new InvalidPayloadException("minutes: " + MIN_MINUTES + " ~ " + MAX_MINUTES + " 사이여야 합니다(" + minutes + ")");
        }
        return minutes;
    }
}
