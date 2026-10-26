package com.messtudy.backend.mapper;

import java.util.List;
import java.util.Map;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 장비 센서 시계열 로그(equipment_sensor_log) 조회. 대시보드가 2초마다 부른다.
 * 기간(minutes)은 DB 현재 시각(now()) 기준으로 "최근 n분"이다.
 */
@Mapper
public interface SensorLogQueryMapper {

    /**
     * 장비마다 가장 최근 로그 1건을 고른다(설비 상태 카드용).
     * 장비 목록은 production_performance의 equipment_id에서 얻는다(장비 기준정보 테이블이 없다).
     * 행 키: equipmentId, recordedAt, status, temperature, vibration
     */
    List<Map<String, Object>> findLatestPerEquipment();

    /**
     * 장비 하나의 최근 n분 로그를 시간순으로 돌려준다(온도 · 진동 추이 차트용).
     * 행 키: recordedAt, status, temperature, vibration
     */
    List<Map<String, Object>> findRecentLogs(@Param("equipmentId") String equipmentId, @Param("minutes") int minutes);

    /**
     * 최근 n분 동안 장비 · 상태별로 머문 시간(초)을 센다(상태 비율 · 가동률용).
     * 로그가 1초에 1행이라 행 수가 곧 초다.
     * 행 키: equipmentId, status, seconds
     */
    List<Map<String, Object>> countStatusSeconds(@Param("minutes") int minutes);

    /**
     * 장비 하나의 최근 n분 동안 상태가 바뀐 구간을 최신 구간부터 돌려준다(상태 변경 이력용).
     * LAG()로 바로 앞 로그와 상태가 다른 지점을 구간 시작으로 본다.
     * 행 키: status, startedAt, endedAt(진행 중이면 null), seconds
     */
    List<Map<String, Object>> findStatusChanges(@Param("equipmentId") String equipmentId, @Param("minutes") int minutes);
}
