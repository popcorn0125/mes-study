package com.messtudy.backend.controller;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.messtudy.backend.service.DowntimeService;
import com.messtudy.backend.service.NotFoundException;

/** DB 없이 기본 값과 404만 확인한다(서비스는 가짜). */
@WebMvcTest(DowntimeController.class)
class DowntimeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private DowntimeService downtimeService;

    @Test
    void 구간을_주지_않으면_오늘이고_목록은_전체다() throws Exception {
        given(downtimeService.summary("today")).willReturn(Map.of("summary", Map.of("downSec", 90)));
        given(downtimeService.list("today", false)).willReturn(Map.of("downtimes", List.of()));

        mockMvc.perform(get("/api/v1/downtimes/summary")).andExpect(status().isOk()).andExpect(jsonPath("$.summary.downSec").value(90));
        mockMvc.perform(get("/api/v1/downtimes")).andExpect(status().isOk()).andExpect(jsonPath("$.downtimes").isArray());
    }

    @Test
    void 없는_정지에_사유를_넣으면_404다() throws Exception {
        Map<String, Object> body = Map.of("reasonCode", "OTHER", "enteredBy", "이현장");
        given(downtimeService.setReason(9, body)).willThrow(new NotFoundException("정지 9을(를) 찾을 수 없습니다"));

        mockMvc.perform(put("/api/v1/downtimes/9/reason").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reasonCode\":\"OTHER\",\"enteredBy\":\"이현장\"}"))
                .andExpect(status().isNotFound());
    }
}
