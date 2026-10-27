package com.messtudy.backend.service;

import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.messtudy.backend.mapper.MasterDataMapper;
import com.messtudy.backend.mapper.WorkOrderMapper;

/**
 * 작업지시 등록 · 조회 · 상태 전환.
 * 상태가 바뀔 때마다 라인이 비었으면 하달된 지시 중 하나를 진행으로 올린다(라인 하나 = 진행 중 1건).
 */
@Service
public class WorkOrderService {

    public static final int MAX_PLANNED_QTY = 10_000;
    public static final int DEFAULT_PRIORITY = 5;

    /** 상태 코드 → 화면 · 오류 메시지용 이름 */
    static final Map<String, String> STATUS_NAMES = Map.of(
            "PLANNED", "계획",
            "RELEASED", "하달",
            "IN_PROGRESS", "진행",
            "HELD", "보류",
            "COMPLETED", "완료");

    private final WorkOrderMapper workOrderMapper;
    private final MasterDataMapper masterDataMapper;

    public WorkOrderService(WorkOrderMapper workOrderMapper, MasterDataMapper masterDataMapper) {
        this.workOrderMapper = workOrderMapper;
        this.masterDataMapper = masterDataMapper;
    }

    /** 목록. statuses가 비어 있으면 전체 */
    public List<Map<String, Object>> findAll(List<String> statuses) {
        for (String status : statuses) {
            if (!STATUS_NAMES.containsKey(status)) {
                throw new InvalidPayloadException("status: 알 수 없는 상태입니다(" + status + ")");
            }
        }
        return workOrderMapper.findAll(statuses);
    }

    /** 상세: 작업지시 + 설비별 수량(performance) */
    public Map<String, Object> findById(String workOrderId) {
        Map<String, Object> workOrder = workOrderMapper.findById(workOrderId);
        if (workOrder == null) {
            throw new NotFoundException("작업지시가 없습니다(" + workOrderId + ")");
        }
        return withPerformance(workOrder);
    }

    /** 진행 중 작업지시 상세. 없으면 null */
    public Map<String, Object> findCurrent() {
        Map<String, Object> workOrder = workOrderMapper.findCurrent();
        return workOrder == null ? null : withPerformance(workOrder);
    }

    /**
     * 등록(계획 상태).
     * @param body itemCode, plannedQty(1~10,000), priority(0~9, 없으면 5), dueAt(ISO 시각, 없어도 됨)
     */
    @Transactional
    public Map<String, Object> create(Map<String, Object> body) {
        if (body == null) {
            throw new InvalidPayloadException("요청 본문이 필요합니다");
        }
        String itemCode = body.get("itemCode") instanceof String text && !text.isBlank() ? text : null;
        if (itemCode == null) {
            throw new InvalidPayloadException("itemCode: 문자열 값이 필요합니다");
        }
        if (!masterDataMapper.existsItem(itemCode)) {
            throw new InvalidPayloadException("itemCode: 없는 품목입니다(" + itemCode + ")");
        }
        int plannedQty = intIn(body, "plannedQty", 1, MAX_PLANNED_QTY, null);
        int priority = intIn(body, "priority", 0, 9, DEFAULT_PRIORITY);
        OffsetDateTime dueAt = optionalTime(body, "dueAt");

        workOrderMapper.lockLine(); // 같은 날 번호가 겹치지 않게
        String workOrderId = workOrderMapper.nextWorkOrderId();
        Map<String, Object> row = new HashMap<>();
        row.put("workOrderId", workOrderId);
        row.put("itemCode", itemCode);
        row.put("plannedQty", plannedQty);
        row.put("priority", priority);
        row.put("dueAt", dueAt);
        workOrderMapper.insert(row);
        return findById(workOrderId);
    }

    /** 하달: 계획 → 하달. 라인이 비어 있으면 바로 진행된다 */
    @Transactional
    public Map<String, Object> release(String workOrderId) {
        return change(workOrderId, List.of("PLANNED"), "RELEASED", "하달");
    }

    /** 보류: 하달 · 진행 → 보류. 진행 중이던 지시면 다음 지시가 진행된다 */
    @Transactional
    public Map<String, Object> hold(String workOrderId) {
        return change(workOrderId, List.of("RELEASED", "IN_PROGRESS"), "HELD", "보류");
    }

    /** 보류 해제: 보류 → 하달(처음 하달 순서를 그대로 쓴다) */
    @Transactional
    public Map<String, Object> resume(String workOrderId) {
        return change(workOrderId, List.of("HELD"), "RELEASED", "보류 해제");
    }

    /**
     * 실적이 저장된 뒤 · 시뮬레이터가 시작할 때 부른다: 진행 중 지시가 다 만들어졌으면 완료하고, 라인이 비었으면 다음 지시를 고른다.
     * 호출하는 트랜잭션이 먼저 lockLine()을 잡아야 한다.
     */
    public void advanceLine() {
        workOrderMapper.completeIfDone();
        workOrderMapper.startNext();
    }

    private Map<String, Object> change(String workOrderId, List<String> from, String to, String action) {
        workOrderMapper.lockLine();
        Map<String, Object> workOrder = workOrderMapper.findById(workOrderId);
        if (workOrder == null) {
            throw new NotFoundException("작업지시가 없습니다(" + workOrderId + ")");
        }
        if (workOrderMapper.transition(workOrderId, from, to) == 0) {
            String now = STATUS_NAMES.get((String) workOrder.get("status"));
            throw new StateConflictException(now + " 상태인 작업지시는 " + action + "할 수 없습니다(" + workOrderId + ")");
        }
        workOrderMapper.startNext();
        return findById(workOrderId);
    }

    private Map<String, Object> withPerformance(Map<String, Object> workOrder) {
        Map<String, Object> detail = new LinkedHashMap<>(workOrder);
        detail.put("performance", workOrderMapper.findPerformance((String) workOrder.get("workOrderId")));
        return detail;
    }

    // ── 값 꺼내기 · 검사 ─────────────────────────────────────

    /** min~max 정수. 값이 없으면 defaultValue(null이면 필수) */
    private static int intIn(Map<String, Object> body, String key, int min, int max, Integer defaultValue) {
        Object value = body.get(key);
        if (value == null && defaultValue != null) {
            return defaultValue;
        }
        if ((value instanceof Integer || value instanceof Long) && ((Number) value).longValue() >= min
                && ((Number) value).longValue() <= max) {
            return ((Number) value).intValue();
        }
        throw new InvalidPayloadException(key + ": " + min + "~" + max + " 사이의 정수가 필요합니다");
    }

    private static OffsetDateTime optionalTime(Map<String, Object> body, String key) {
        Object value = body.get(key);
        if (value == null || (value instanceof String text && text.isBlank())) {
            return null;
        }
        if (value instanceof String text) {
            try {
                return OffsetDateTime.parse(text);
            } catch (DateTimeParseException e) {
                // 아래에서 형식 오류로 처리한다
            }
        }
        throw new InvalidPayloadException(key + ": ISO 시각 형식이 아닙니다(" + value + ")");
    }
}
