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
import com.messtudy.backend.service.QualityService;

/** DB 없이 기본 구간과 400만 확인한다(서비스는 가짜). */
@WebMvcTest(QualityController.class)
class QualityControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private QualityService qualityService;

    @Test
    void 구간을_주지_않으면_오늘이다() throws Exception {
        given(qualityService.summary("today")).willReturn(Map.of("summary", Map.of("fpy", 0.8)));
        given(qualityService.trend("today")).willReturn(Map.of("bucketSec", 3600));

        mockMvc.perform(get("/api/v1/quality")).andExpect(status().isOk()).andExpect(jsonPath("$.summary.fpy").value(0.8));
        mockMvc.perform(get("/api/v1/quality/trend")).andExpect(status().isOk()).andExpect(jsonPath("$.bucketSec").value(3600));
    }

    @Test
    void 모르는_구간은_400이다() throws Exception {
        given(qualityService.trend("24h")).willThrow(new InvalidPayloadException("range: today · 1h · 8h 중 하나여야 합니다(24h)"));

        mockMvc.perform(get("/api/v1/quality/trend").param("range", "24h")).andExpect(status().isBadRequest());
    }
}
