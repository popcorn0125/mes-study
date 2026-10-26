package com.messtudy.backend.controller;

import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.messtudy.backend.service.EquipmentQueryService;
import com.messtudy.backend.service.InvalidPayloadException;
import com.messtudy.backend.service.ProductionQueryService;

/** DB 없이 조회 API의 경로 · 기본값 · 오류 응답 · CORS만 확인한다(서비스는 가짜). */
@WebMvcTest({EquipmentQueryController.class, ProductionQueryController.class})
class QueryControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private EquipmentQueryService equipmentQueryService;

    @MockitoBean
    private ProductionQueryService productionQueryService;

    @Test
    void 최신_로그를_배열로_돌려준다() throws Exception {
        given(equipmentQueryService.findLatest()).willReturn(List.of(Map.of("equipmentId", "CNC_01", "status", "RUN")));

        mockMvc.perform(get("/api/v1/equipment/latest"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].equipmentId").value("CNC_01"))
                .andExpect(jsonPath("$[0].status").value("RUN"));
    }

    @Test
    void minutes가_없으면_추이는_10분_상태는_60분으로_조회한다() throws Exception {
        mockMvc.perform(get("/api/v1/equipment/CNC_01/sensor-logs")).andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/equipment/status-summary")).andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/equipment/CNC_01/status-changes")).andExpect(status().isOk());

        verify(equipmentQueryService).findRecentLogs("CNC_01", 10);
        verify(equipmentQueryService).countStatusSeconds(60);
        verify(equipmentQueryService).findStatusChanges("CNC_01", 60);
    }

    @Test
    void minutes를_주면_그_값으로_조회한다() throws Exception {
        mockMvc.perform(get("/api/v1/equipment/WINDER_01/sensor-logs").param("minutes", "30")).andExpect(status().isOk());

        verify(equipmentQueryService).findRecentLogs("WINDER_01", 30);
    }

    @Test
    void minutes가_범위_밖이거나_숫자가_아니면_400과_이유를_돌려준다() throws Exception {
        given(equipmentQueryService.countStatusSeconds(0)).willThrow(new InvalidPayloadException("minutes: 1 ~ 1440 사이여야 합니다(0)"));

        mockMvc.perform(get("/api/v1/equipment/status-summary").param("minutes", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("minutes: 1 ~ 1440 사이여야 합니다(0)"));
        mockMvc.perform(get("/api/v1/equipment/status-summary").param("minutes", "abc"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("minutes: 형식이 맞지 않습니다(abc)"));
    }

    @Test
    void 실적을_배열로_돌려준다() throws Exception {
        given(productionQueryService.findAll()).willReturn(List.of(Map.of("equipmentId", "CNC_01", "totalCount", 3)));

        mockMvc.perform(get("/api/v1/production-performance"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].totalCount").value(3));
    }

    @Test
    void 프론트_개발_서버의_GET_사전_요청을_허용한다() throws Exception {
        mockMvc.perform(options("/api/v1/equipment/latest")
                        .header("Origin", "http://localhost:5173")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
    }
}
