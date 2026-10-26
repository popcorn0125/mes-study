package com.messtudy.backend.controller;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.messtudy.backend.service.ProductionQueryService;

/** 생산 현황 화면이 2초마다 부르는 작업 실적 조회 API */
@RestController
@RequestMapping("/api/v1/production-performance")
public class ProductionQueryController {

    private final ProductionQueryService productionQueryService;

    public ProductionQueryController(ProductionQueryService productionQueryService) {
        this.productionQueryService = productionQueryService;
    }

    /** 모든 (작업지시, 장비)의 현재 누적 수량. 예: GET /api/v1/production-performance */
    @GetMapping
    public List<Map<String, Object>> findAll() {
        return productionQueryService.findAll();
    }
}
