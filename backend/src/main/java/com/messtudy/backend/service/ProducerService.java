package com.messtudy.backend.service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.messtudy.backend.mapper.ProducerRunMapper;
import com.messtudy.backend.mapper.WorkOrderMapper;

/**
 * 시뮬레이터(데이터 발생기)와 주고받는 일.
 * - 시작: 새 실행 ID를 활성으로 만들고(이전 탭은 밀려난다) 진행 중 지시와 저장된 수량을 돌려준다.
 * - 1초 전송: 활성 실행만 받는다. 실적이 있으면 라인 잠금 안에서 저장 뒤 완료 판정 · 다음 지시 선택을 하고, 지금 진행 중인 지시를 알려 준다.
 *   센서만 온 요청(실적 없음)은 작업지시를 바꾸지 않으므로 라인 잠금 없이 설비별 잠금만 잡는다(docs/plans/sensor-rollup.md 14장).
 */
@Service
public class ProducerService {

    private final ProducerRunMapper producerRunMapper;
    private final WorkOrderMapper workOrderMapper;
    private final WorkOrderService workOrderService;
    private final SensorLogService sensorLogService;

    public ProducerService(ProducerRunMapper producerRunMapper, WorkOrderMapper workOrderMapper,
            WorkOrderService workOrderService, SensorLogService sensorLogService) {
        this.producerRunMapper = producerRunMapper;
        this.workOrderMapper = workOrderMapper;
        this.workOrderService = workOrderService;
        this.sensorLogService = sensorLogService;
    }

    /** @return runId, workOrder(진행 중 지시 상세 + 설비별 저장 수량, 없으면 null) */
    @Transactional
    public Map<String, Object> start() {
        String runId = UUID.randomUUID().toString();
        producerRunMapper.activate(runId);
        workOrderMapper.lockLine();
        workOrderService.advanceLine();
        Map<String, Object> result = new HashMap<>();
        result.put("runId", runId);
        result.put("workOrder", workOrderService.findCurrent());
        return result;
    }

    /**
     * @param runId 요청 헤더의 실행 ID. 활성 실행이 아니면(다른 탭이 넘겨받음, 헤더 없음) 409
     * @return sensorLogs · productions(저장 건수), workOrder(지금 진행 중인 지시 workOrderId · plannedQty, 없으면 null)
     */
    @Transactional
    public Map<String, Object> receive(String runId, List<Map<String, Object>> payload) {
        if (runId == null || !runId.equals(producerRunMapper.findActiveRunId())) {
            throw new StateConflictException("다른 시뮬레이터가 실행 중입니다. 이 시뮬레이터를 쓰려면 다시 시작하세요");
        }
        boolean lineWork = hasProduction(payload);
        if (lineWork) {
            workOrderMapper.lockLine();
        }
        Map<String, Object> result = new HashMap<>(sensorLogService.save(payload));
        if (lineWork) {
            workOrderService.advanceLine();
        }
        Map<String, Object> current = workOrderMapper.findCurrent();
        result.put("workOrder", current == null ? null
                : Map.of("workOrderId", current.get("workOrderId"), "plannedQty", current.get("plannedQty")));
        return result;
    }

    /** 실적(workOrderId · production)이 하나라도 있으면 라인 작업이다. 형식 검사는 SensorLogService가 한다 */
    static boolean hasProduction(List<Map<String, Object>> payload) {
        return payload != null && payload.stream()
                .anyMatch(item -> item != null && (item.get("workOrderId") != null || item.get("production") != null));
    }
}
