package com.messtudy.backend.mapper;

import java.util.List;
import java.util.Map;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 작업지시(work_order) 저장 · 조회 · 상태 전환.
 * 작업지시 행 키: workOrderId, itemCode, itemName, plannedQty, status, priority, dueAt,
 * createdAt, releasedAt, startedAt, completedAt, completedQty(마지막 공정 양품 수)
 */
@Mapper
public interface WorkOrderMapper {

    /**
     * 라인 잠금(트랜잭션이 끝날 때 풀린다). 작업지시 상태를 바꾸는 트랜잭션은 먼저 이것을 불러
     * "진행 중 지시 고르기 · 완료 판정"이 동시에 두 번 돌지 않게 한다.
     */
    int lockLine();

    /** 오늘(한국 시간) 다음 작업지시 번호. 예: WO-20261028-003 */
    String nextWorkOrderId();

    /** 등록(PLANNED). 키: workOrderId, itemCode, plannedQty, priority, dueAt(null 가능) */
    void insert(Map<String, Object> workOrder);

    /** 목록. statuses가 비어 있으면 전체. 진행 → 하달 → 보류 → 계획 → 완료(최근 순) */
    List<Map<String, Object>> findAll(@Param("statuses") List<String> statuses);

    /** 한 건. 없으면 null */
    Map<String, Object> findById(String workOrderId);

    /** 진행 중인 한 건. 없으면 null */
    Map<String, Object> findCurrent();

    /**
     * 설비별 수량(라인 순서, 실적이 없는 설비도 0으로).
     * 행 키: equipmentId, equipmentName, lineOrder, standardTactSec, totalCount, goodCount, badCount
     */
    List<Map<String, Object>> findPerformance(String workOrderId);

    /** 유형별 누적 불량 수. 행 키: equipmentId, defectCode, defectCount */
    List<Map<String, Object>> findDefects(String workOrderId);

    /**
     * 지금 상태가 from 중 하나일 때만 to로 바꾼다. 시각 열(하달 · 시작 · 완료)도 함께 채운다.
     * @return 바꾼 행 수(0이면 지금 상태에서 할 수 없는 전환)
     */
    int transition(@Param("workOrderId") String workOrderId, @Param("from") List<String> from, @Param("to") String to);

    /** 진행 중 지시가 없으면 하달된 지시 중 우선순위 높은 순 → 하달 빠른 순으로 하나를 진행으로 바꾼다. @return 바꾼 행 수 */
    int startNext();

    /** 진행 중 지시의 마지막 공정 양품 수가 지시 수량 이상이면 완료로 바꾼다. @return 바꾼 행 수 */
    int completeIfDone();
}
