package com.messtudy.backend.controller;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.messtudy.backend.service.ProducerService;

/** 자동 시뮬레이션(프론트 /simulator)이 1초마다 보내는 설비 데이터를 받는다. */
@RestController
@RequestMapping("/api/v1/sensor-logs")
public class SensorLogController {

    /** 시뮬레이터가 시작할 때 받은 실행 ID(POST /api/v1/producer/runs) */
    public static final String RUN_ID_HEADER = "X-Producer-Run-Id";

    private final ProducerService producerService;

    public SensorLogController(ProducerService producerService) {
        this.producerService = producerService;
    }

    /**
     * 설비별 데이터 배열을 받아 저장하고, 저장한 건수와 지금 진행 중인 작업지시를 돌려준다.
     * 활성 실행 ID가 아니면(다른 탭이 넘겨받음 · 헤더 없음) 409.
     */
    @PostMapping("/bulk")
    public Map<String, Object> saveBulk(@RequestHeader(value = RUN_ID_HEADER, required = false) String runId,
            @RequestBody List<Map<String, Object>> payload) {
        return producerService.receive(runId, payload);
    }
}
