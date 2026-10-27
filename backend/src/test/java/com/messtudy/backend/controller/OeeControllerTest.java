package com.messtudy.backend.controller;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.messtudy.backend.service.InvalidPayloadException;
import com.messtudy.backend.service.NotFoundException;
import com.messtudy.backend.service.OeeService;

/** DB 없이 기본 구간과 응답 코드(400 · 404)만 확인한다(서비스는 가짜). */
@WebMvcTest(OeeController.class)
class OeeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private OeeService oeeService;

    @Test
    void 구간을_주지_않으면_오늘이다() throws Exception {
        given(oeeService.summary("today")).willReturn(Map.of("line", Map.of("oee", 0.6)));
        given(oeeService.trend("today")).willReturn(Map.of("bucketSec", 3600));

        mockMvc.perform(get("/api/v1/oee")).andExpect(status().isOk()).andExpect(jsonPath("$.line.oee").value(0.6));
        mockMvc.perform(get("/api/v1/oee/trend")).andExpect(status().isOk()).andExpect(jsonPath("$.bucketSec").value(3600));
    }

    @Test
    void 모르는_구간은_400이다() throws Exception {
        given(oeeService.summary("24h")).willThrow(new InvalidPayloadException("range: today · 1h · 8h 중 하나여야 합니다(24h)"));

        mockMvc.perform(get("/api/v1/oee").param("range", "24h")).andExpect(status().isBadRequest());
    }

    @Test
    void 없는_작업지시는_404다() throws Exception {
        given(oeeService.forWorkOrder("WO-NONE")).willThrow(new NotFoundException("작업지시가 없습니다(WO-NONE)"));

        mockMvc.perform(get("/api/v1/work-orders/WO-NONE/oee")).andExpect(status().isNotFound());
    }
}
