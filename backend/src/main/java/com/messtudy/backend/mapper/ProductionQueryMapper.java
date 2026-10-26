package com.messtudy.backend.mapper;

import java.util.List;
import java.util.Map;

import org.apache.ibatis.annotations.Mapper;

/** 작업 실적(production_performance) 조회. 대시보드가 2초마다 부른다. */
@Mapper
public interface ProductionQueryMapper {

    /**
     * 모든 (작업지시, 장비)의 현재 누적 수량을 돌려준다(생산 현황 화면용).
     * 행 키: workOrderId, equipmentId, totalCount, goodCount, badCount, lastUpdatedAt
     */
    List<Map<String, Object>> findAll();
}
