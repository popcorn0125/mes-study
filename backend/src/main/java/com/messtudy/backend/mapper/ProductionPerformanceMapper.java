package com.messtudy.backend.mapper;

import java.util.List;
import java.util.Map;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** 작업 실적(production_performance) · 생산 이벤트(production_event), 유형별 불량 실적(production_defect) · 불량 이벤트(defect_event) */
@Mapper
public interface ProductionPerformanceMapper {

    /**
     * 저장된 누적 수량보다 늘어난 만큼을 생산 이벤트(production_event)로 한 행씩 넣는다. upsertAll 전에 부른다.
     * 행 키: upsertAll과 같고 occurredAt(OffsetDateTime, 전송 시각)이 더 있다
     *
     * @return 넣은 이벤트 수
     */
    int insertEvents(@Param("rows") List<Map<String, Object>> rows);

    /**
     * (작업지시, 장비)마다 최신 누적 수량을 UPSERT한다. 없으면 추가, 있으면 갱신.
     * 들어온 total_count가 지금 값보다 작으면(늦게 도착한 옛날 요청) 갱신하지 않는다.
     * 행 키: workOrderId, equipmentId, totalCount, goodCount, badCount
     * 같은 (작업지시, 장비)가 한 번에 두 번 들어오면 PostgreSQL이 오류를 내므로, 호출하는 쪽에서 중복을 없애야 한다.
     *
     * @return 추가 · 갱신된 행 수(역전 방지로 건너뛴 행은 세지 않는다)
     */
    int upsertAll(@Param("rows") List<Map<String, Object>> rows);

    /**
     * 저장된 유형별 누적 불량보다 늘어난 만큼을 불량 이벤트(defect_event)로 넣는다. upsertDefects 전에 부른다.
     * 행 키: workOrderId, equipmentId, defectCode, defectCount, occurredAt
     *
     * @return 넣은 이벤트 수
     */
    int insertDefectEvents(@Param("rows") List<Map<String, Object>> rows);

    /**
     * (작업지시, 설비, 유형)마다 최신 누적 불량 수를 UPSERT한다. 지금 값보다 작은 값으로는 덮어쓰지 않는다.
     * 행 키는 insertDefectEvents와 같다. 한 번에 같은 키가 두 번 들어오면 안 된다.
     *
     * @return 추가 · 갱신된 행 수
     */
    int upsertDefects(@Param("rows") List<Map<String, Object>> rows);
}
