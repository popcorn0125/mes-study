package com.messtudy.backend.controller;

import java.util.Map;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.messtudy.backend.service.ProducerService;

/** 시뮬레이터 실행. 마지막에 시작한 시뮬레이터 하나만 데이터를 보낼 수 있다. */
@RestController
@RequestMapping("/api/v1/producer")
public class ProducerController {

    private final ProducerService producerService;

    public ProducerController(ProducerService producerService) {
        this.producerService = producerService;
    }

    /** 시작(넘겨받기). runId와 진행 중 작업지시(설비별 저장 수량 포함, 없으면 null)를 돌려준다 */
    @PostMapping("/runs")
    public Map<String, Object> start() {
        return producerService.start();
    }
}
