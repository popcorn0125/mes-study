package com.messtudy.backend.service;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.messtudy.backend.mapper.ProductionQueryMapper;

/** 생산 현황 화면이 쓰는 작업 실적 조회 */
@Service
public class ProductionQueryService {

    private final ProductionQueryMapper productionQueryMapper;

    public ProductionQueryService(ProductionQueryMapper productionQueryMapper) {
        this.productionQueryMapper = productionQueryMapper;
    }

    /** 모든 (작업지시, 장비)의 현재 누적 수량 */
    public List<Map<String, Object>> findAll() {
        return productionQueryMapper.findAll();
    }
}
