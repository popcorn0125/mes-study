package com.messtudy.backend.controller;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.messtudy.backend.service.MasterDataService;

/** 기준정보 조회 */
@RestController
@RequestMapping("/api/v1")
public class MasterDataController {

    private final MasterDataService masterDataService;

    public MasterDataController(MasterDataService masterDataService) {
        this.masterDataService = masterDataService;
    }

    /** 품목 목록. 예: GET /api/v1/items */
    @GetMapping("/items")
    public List<Map<String, Object>> items() {
        return masterDataService.findItems();
    }

    /** 설비 목록(라인 순서, 기준 택트). 예: GET /api/v1/equipment */
    @GetMapping("/equipment")
    public List<Map<String, Object>> equipment() {
        return masterDataService.findEquipment();
    }
}
