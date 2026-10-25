package com.messtudy.backend.controller;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.messtudy.backend.service.SensorLogService;

/** 자동 시뮬레이션(프론트 /simulator)이 1초마다 보내는 설비 데이터를 받는다. */
@RestController
@RequestMapping("/api/v1/sensor-logs")
public class SensorLogController {

    private final SensorLogService sensorLogService;

    public SensorLogController(SensorLogService sensorLogService) {
        this.sensorLogService = sensorLogService;
    }

    /** 설비별 데이터 배열을 받아 저장하고, 저장한 건수를 돌려준다. */
    @PostMapping("/bulk")
    public Map<String, Integer> saveBulk(@RequestBody List<Map<String, Object>> payload) {
        return sensorLogService.save(payload);
    }
}
