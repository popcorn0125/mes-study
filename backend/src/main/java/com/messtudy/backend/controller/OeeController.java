package com.messtudy.backend.controller;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.messtudy.backend.service.OeeService;

/** OEE 조회 API. 구간(range)은 today · 1h · 8h, 그 밖의 값은 400 */
@RestController
public class OeeController {

    private final OeeService oeeService;

    public OeeController(OeeService oeeService) {
        this.oeeService = oeeService;
    }

    /** 구간의 라인 OEE와 설비별 분해. 예: GET /api/v1/oee?range=today */
    @GetMapping("/api/v1/oee")
    public Map<String, Object> summary(@RequestParam(defaultValue = "today") String range) {
        return oeeService.summary(range);
    }

    /** 시각 칸(1시간은 5분, 그 밖은 1시간)마다 라인 OEE. 예: GET /api/v1/oee/trend?range=8h */
    @GetMapping("/api/v1/oee/trend")
    public Map<String, Object> trend(@RequestParam(defaultValue = "today") String range) {
        return oeeService.trend(range);
    }

    /** 작업지시 하나의 OEE. 없는 지시는 404. 예: GET /api/v1/work-orders/WO-20261027-001/oee */
    @GetMapping("/api/v1/work-orders/{workOrderId}/oee")
    public Map<String, Object> workOrder(@PathVariable String workOrderId) {
        return oeeService.forWorkOrder(workOrderId);
    }
}
