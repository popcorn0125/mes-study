package com.messtudy.backend.mapper;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** 설비 상태 이력(equipment_status_change): 상태가 바뀔 때만 1행. 진행 중인 행은 endedAt이 null(설비마다 하나) */
@Mapper
public interface StatusChangeMapper {

    /** 설비별 수신 잠금(트랜잭션이 끝날 때 풀린다). 같은 설비의 정지 · 상태 이력 · 메모리 상태를 한 요청씩 바꾼다 */
    void lockEquipment(@Param("equipmentId") String equipmentId);

    /** 진행 중인 행 모두. @return equipmentId, status, startedAt */
    List<Map<String, Object>> findOpen();

    /** 설비의 진행 중인 행을 끝낸다(시작 + 1초보다 이르면 시작 + 1초) */
    int close(@Param("equipmentId") String equipmentId, @Param("endedAt") OffsetDateTime endedAt);

    /** 새 구간을 연다 */
    int open(@Param("equipmentId") String equipmentId, @Param("status") String status, @Param("startedAt") OffsetDateTime startedAt);

    /** 설비 하나의 from 뒤에 끝났거나 진행 중인 구간, 최신부터. @return status, startedAt, endedAt */
    List<Map<String, Object>> findSince(@Param("equipmentId") String equipmentId, @Param("from") OffsetDateTime from);
}
