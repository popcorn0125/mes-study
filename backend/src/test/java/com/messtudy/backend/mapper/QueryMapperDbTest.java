package com.messtudy.backend.mapper;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import com.messtudy.backend.TestDb;
import com.messtudy.backend.service.SensorAggregator;

/** 테스트 DB(mes_test)에 실적을 넣고 조회 SQL 결과를 확인한다. 센서 조회는 SensorRollupServiceDbTest에서 본다. */
@SpringBootTest
@ActiveProfiles("test")
class QueryMapperDbTest {

    @Autowired
    private ProductionQueryMapper productionQueryMapper;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private SensorAggregator aggregator;

    @BeforeEach
    void clean() {
        TestDb.resetWithWorkOrder(jdbc, aggregator);
    }

    /** 실적 한 행을 넣는다 */
    private void production(String equipmentId, int total) {
        jdbc.update("INSERT INTO production_performance (work_order_id, equipment_id, total_count, good_count, bad_count) VALUES (?, ?, ?, ?, 0)",
                "WO-20261024-001", equipmentId, total, total);
    }

    @Test
    void 실적을_작업지시_장비_순으로_돌려준다() {
        production("WINDER_01", 2);
        production("CNC_01", 3);

        List<Map<String, Object>> rows = productionQueryMapper.findAll();

        assertThat(rows).extracting(r -> r.get("equipmentId")).containsExactly("CNC_01", "WINDER_01");
        assertThat(rows.get(0))
                .containsEntry("workOrderId", "WO-20261024-001")
                .containsEntry("totalCount", 3)
                .containsEntry("goodCount", 3)
                .containsEntry("badCount", 0)
                .containsKey("lastUpdatedAt");
    }
}
