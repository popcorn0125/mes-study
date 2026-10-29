package com.messtudy.backend.mapper;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 센서 1분 요약(equipment_sensor_minute). 메모리에서 모은 버킷을 넣고, OEE · 상태 비율 · 긴 추이가 읽는다.
 * 행 키(넣을 때): equipmentId, bucketStart, workOrderId(없으면 ""), sampleCount,
 * temperatureSum · temperatureCount · temperatureMin · temperatureMax, vibration(같은 네 개),
 * runSec · warnSec · downSec · idleSec, lastStatus · lastRecordedAt · lastTemperature · lastVibration
 */
@Mapper
public interface SensorMinuteMapper {

    /** 넣는다. 같은 키가 있으면 합친다(늦게 온 행: 개수 · 합 · 초는 더하고, 최소 · 최대는 비교, 마지막 값은 더 늦은 쪽) */
    int merge(@Param("rows") List<Map<String, Object>> rows);

    /** 넣는다. 같은 키가 있으면 덮어쓴다(스풀로 다시 집계한 값이 정답일 때: 서버를 다시 띄운 복구) */
    int overwrite(@Param("rows") List<Map<String, Object>> rows);

    /**
     * OEE용 설비 · (시각 칸)별 작업지시가 있던 초와 그중 상태별 초. 구간(from · to) 또는 작업지시(workOrderId) 중 하나로 조회한다.
     * 구간 시작은 분 단위로 내림한다(요약이 분 단위라 최대 1분 차이).
     *
     * @return equipmentId, (bucketStart), plannedSec · runSec · downSec · idleSec
     */
    List<Map<String, Object>> sumSeconds(@Param("from") OffsetDateTime from, @Param("to") OffsetDateTime to,
            @Param("workOrderId") String workOrderId, @Param("bucketSec") Integer bucketSec);

    /** from(분 단위로 내림) 이후 설비별 상태 초. @return equipmentId, runSec · warnSec · downSec · idleSec */
    List<Map<String, Object>> sumStatusSeconds(@Param("from") OffsetDateTime from);

    /** 설비 하나의 from 이후 분마다 1점(평균 온도 · 진동, 그 분의 마지막 상태). @return recordedAt, status, temperature, vibration */
    List<Map<String, Object>> findMinutes(@Param("equipmentId") String equipmentId, @Param("from") OffsetDateTime from);

    /** 설비 기준정보마다 요약의 마지막 값(메모리가 빈 서버 시작 직후용). @return equipmentId, recordedAt, status, temperature, vibration */
    List<Map<String, Object>> findLastPerEquipment();

    /** 설비의 마지막으로 받은 시각(요약 기준, 없으면 null) */
    OffsetDateTime findLastRecordedAt(@Param("equipmentId") String equipmentId);
}
