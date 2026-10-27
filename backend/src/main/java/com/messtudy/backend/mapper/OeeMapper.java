package com.messtudy.backend.mapper;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * OEE 계산용 합계. 구간(from · to) 또는 작업지시(workOrderId) 중 하나로 조회한다(다른 쪽은 null).
 * bucketSec가 있으면 시각 칸마다 나눠 bucketStart 키가 붙는다.
 */
@Mapper
public interface OeeMapper {

    /** @return equipmentId, (bucketStart), plannedSec · runSec · downSec · idleSec */
    List<Map<String, Object>> sumSeconds(@Param("from") OffsetDateTime from, @Param("to") OffsetDateTime to,
            @Param("workOrderId") String workOrderId, @Param("bucketSec") Integer bucketSec);

    /** @return equipmentId, (bucketStart), goodCount · badCount */
    List<Map<String, Object>> sumCounts(@Param("from") OffsetDateTime from, @Param("to") OffsetDateTime to,
            @Param("workOrderId") String workOrderId, @Param("bucketSec") Integer bucketSec);
}
