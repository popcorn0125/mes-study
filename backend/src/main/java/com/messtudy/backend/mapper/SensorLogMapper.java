package com.messtudy.backend.mapper;

import java.util.List;
import java.util.Map;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** 장비 센서 시계열 로그(equipment_sensor_log) */
@Mapper
public interface SensorLogMapper {

    /**
     * 여러 행을 INSERT 한 번으로 넣는다.
     * 행 키: equipmentId, recordedAt(OffsetDateTime), status, temperature · vibration(BigDecimal, 없으면 null)
     *
     * @return 넣은 행 수
     */
    int insertAll(@Param("logs") List<Map<String, Object>> logs);
}
