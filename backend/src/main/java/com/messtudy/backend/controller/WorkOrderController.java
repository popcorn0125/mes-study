package com.messtudy.backend.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.messtudy.backend.service.WorkOrderService;

/** 작업지시 관리 API */
@RestController
@RequestMapping("/api/v1/work-orders")
public class WorkOrderController {

    private final WorkOrderService workOrderService;

    public WorkOrderController(WorkOrderService workOrderService) {
        this.workOrderService = workOrderService;
    }

    /** 목록. 예: GET /api/v1/work-orders?status=RELEASED&status=HELD (없으면 전체) */
    @GetMapping
    public List<Map<String, Object>> findAll(@RequestParam(name = "status", required = false) List<String> statuses) {
        return workOrderService.findAll(statuses == null ? List.of() : statuses);
    }

    /** 진행 중 작업지시(설비별 수량 포함). 없으면 204 */
    @GetMapping("/current")
    public ResponseEntity<Map<String, Object>> current() {
        Map<String, Object> current = workOrderService.findCurrent();
        return current == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(current);
    }

    /** 상세(설비별 수량 포함). 없으면 404 */
    @GetMapping("/{workOrderId}")
    public Map<String, Object> findById(@PathVariable String workOrderId) {
        return workOrderService.findById(workOrderId);
    }

    /** 등록. 본문: {itemCode, plannedQty, priority?, dueAt?} */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(@RequestBody Map<String, Object> body) {
        return workOrderService.create(body);
    }

    /** 하달. 계획 상태가 아니면 409 */
    @PostMapping("/{workOrderId}/release")
    public Map<String, Object> release(@PathVariable String workOrderId) {
        return workOrderService.release(workOrderId);
    }

    /** 보류. 하달 · 진행 상태가 아니면 409 */
    @PostMapping("/{workOrderId}/hold")
    public Map<String, Object> hold(@PathVariable String workOrderId) {
        return workOrderService.hold(workOrderId);
    }

    /** 보류 해제. 보류 상태가 아니면 409 */
    @PostMapping("/{workOrderId}/resume")
    public Map<String, Object> resume(@PathVariable String workOrderId) {
        return workOrderService.resume(workOrderId);
    }
}
