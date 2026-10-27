package com.messtudy.backend.service;

import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.messtudy.backend.mapper.MasterDataMapper;

/** 기준정보(품목 · 설비) 조회 */
@Service
public class MasterDataService {

    private final MasterDataMapper masterDataMapper;

    public MasterDataService(MasterDataMapper masterDataMapper) {
        this.masterDataMapper = masterDataMapper;
    }

    public List<Map<String, Object>> findItems() {
        return masterDataMapper.findItems();
    }

    public List<Map<String, Object>> findEquipment() {
        return masterDataMapper.findEquipment();
    }
}
