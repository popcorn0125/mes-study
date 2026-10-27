package com.messtudy.backend.mapper;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** 품질 화면용 합계(구간 [from, to)). 설비별 양품 · 불량 수는 OeeMapper.sumCounts를 함께 쓴다. */
@Mapper
public interface QualityMapper {

    /**
     * 유형별 불량 수(많은 순, 같으면 유형 표시 순서).
     * 행 키: defectCode, defectName, equipmentId, equipmentName, count
     */
    List<Map<String, Object>> sumDefects(@Param("from") OffsetDateTime from, @Param("to") OffsetDateTime to);

    /**
     * 구간 안에 생산이 있던 작업지시별 완성품(마지막 공정 양품) · 불량(전 공정) 수와 가장 많은 유형(시작이 늦은 지시부터).
     * 행 키: workOrderId, itemCode, status, finishedCount, badCount, topDefectName(유형 있는 불량이 없으면 null)
     */
    List<Map<String, Object>> sumByWorkOrder(@Param("from") OffsetDateTime from, @Param("to") OffsetDateTime to);
}
