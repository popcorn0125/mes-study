package com.messtudy.backend.controller;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.messtudy.backend.service.EquipmentQueryService;

/** 설비 관리 화면이 2초마다 부르는 센서 로그 조회 API */
@RestController
@RequestMapping("/api/v1/equipment")
public class EquipmentQueryController {

    private final EquipmentQueryService equipmentQueryService;

    public EquipmentQueryController(EquipmentQueryService equipmentQueryService) {
        this.equipmentQueryService = equipmentQueryService;
    }

    /** 장비마다 가장 최근 로그 1건. 예: GET /api/v1/equipment/latest */
    @GetMapping("/latest")
    public List<Map<String, Object>> latest() {
        return equipmentQueryService.findLatest();
    }

    /** 장비 하나의 최근 n분 로그(기본 10분). 예: GET /api/v1/equipment/CNC_01/sensor-logs?minutes=10 */
    @GetMapping("/{equipmentId}/sensor-logs")
    public List<Map<String, Object>> sensorLogs(
            @PathVariable String equipmentId,
            @RequestParam(defaultValue = "10") int minutes) {
        return equipmentQueryService.findRecentLogs(equipmentId, minutes);
    }

    /** 최근 n분 동안 장비 · 상태별로 머문 초(기본 60분). 예: GET /api/v1/equipment/status-summary?minutes=60 */
    @GetMapping("/status-summary")
    public List<Map<String, Object>> statusSummary(@RequestParam(defaultValue = "60") int minutes) {
        return equipmentQueryService.countStatusSeconds(minutes);
    }

    /** 장비 하나의 최근 n분 상태 변경 구간(기본 60분). 예: GET /api/v1/equipment/CNC_01/status-changes?minutes=60 */
    @GetMapping("/{equipmentId}/status-changes")
    public List<Map<String, Object>> statusChanges(
            @PathVariable String equipmentId,
            @RequestParam(defaultValue = "60") int minutes) {
        return equipmentQueryService.findStatusChanges(equipmentId, minutes);
    }
}
