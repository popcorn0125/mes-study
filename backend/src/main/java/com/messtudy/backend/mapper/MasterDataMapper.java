package com.messtudy.backend.mapper;

import java.util.List;
import java.util.Map;

import org.apache.ibatis.annotations.Mapper;

/** 기준정보(품목 · 설비) 조회 */
@Mapper
public interface MasterDataMapper {

    /** 품목 목록. 행 키: itemCode, itemName */
    List<Map<String, Object>> findItems();

    /** 설비 목록(라인 순서). 행 키: equipmentId, equipmentName, workCenterName, lineOrder, standardTactSec */
    List<Map<String, Object>> findEquipment();

    /** 품목이 있는지 */
    boolean existsItem(String itemCode);
}
