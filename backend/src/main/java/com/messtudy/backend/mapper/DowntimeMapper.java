package com.messtudy.backend.mapper;

import java.util.Map;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** 수신 때 정지(downtime) 한 건을 만들고 이어 붙인다. 조회 · 사유 입력은 DowntimeQueryMapper */
@Mapper
public interface DowntimeMapper {

    /** 설비의 마지막 정지: id, lastSeenAt, alarmCode. 없으면 null */
    Map<String, Object> findLatest(@Param("equipmentId") String equipmentId);

    /** 정지를 이 시각까지 늘린다(last_seen_at = recordedAt, duration_sec + 1) */
    int extend(@Param("id") long id, @Param("recordedAt") Object recordedAt);

    /**
     * 새 정지 1초를 넣는다. 알람 코드가 그 설비의 알람이면 알람의 사유를 자동(AUTO)으로 넣는다.
     * 행 키: equipmentId, recordedAt, workOrderId(없으면 null), alarmCode(없으면 null).
     * 다른 설비의 알람 · 없는 알람은 외래 키 위반이다
     */
    int insert(@Param("row") Map<String, Object> row);
}
