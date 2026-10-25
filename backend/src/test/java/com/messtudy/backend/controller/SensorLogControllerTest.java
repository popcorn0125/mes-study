package com.messtudy.backend.controller;

import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.messtudy.backend.service.InvalidPayloadException;
import com.messtudy.backend.service.SensorLogService;

/** DB 없이 요청 · 응답 형식과 CORS만 확인한다(서비스는 가짜). WebConfig · 예외 처리기는 @WebMvcTest가 함께 올린다. */
@WebMvcTest(SensorLogController.class)
class SensorLogControllerTest {

    private static final String URL = "/api/v1/sensor-logs/bulk";
    private static final String BODY = """
            [{
              "equipmentId": "CNC_01",
              "timestamp": "2026-10-24T23:37:12.451Z",
              "status": "RUN",
              "workOrderId": "WO-20261024-001",
              "metrics": { "temperature": 82.4, "vibration": 1.2 },
              "production": { "totalCount": 150, "goodCount": 148, "badCount": 2 }
            }]
            """;

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private SensorLogService sensorLogService;

    @Test
    void 정상_요청이면_200과_저장_건수를_돌려준다() throws Exception {
        given(sensorLogService.save(anyList())).willReturn(Map.of("sensorLogs", 1, "productions", 1));

        mockMvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sensorLogs").value(1))
                .andExpect(jsonPath("$.productions").value(1));
    }

    @Test
    void 빈_배열도_200이다() throws Exception {
        given(sensorLogService.save(anyList())).willReturn(Map.of("sensorLogs", 0, "productions", 0));

        mockMvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content("[]"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sensorLogs").value(0));
    }

    @Test
    void 필수_값이_없으면_400과_이유를_돌려준다() throws Exception {
        given(sensorLogService.save(anyList())).willThrow(new InvalidPayloadException("[0].equipmentId: 문자열 값이 필요합니다"));

        mockMvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("[0].equipmentId: 문자열 값이 필요합니다"));
    }

    @Test
    void 배열이_아니거나_JSON이_깨지면_400이다() throws Exception {
        mockMvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content("{\"equipmentId\":\"CNC_01\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content("[{"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void 프론트_개발_서버_출처의_CORS_사전_요청은_허용한다() throws Exception {
        mockMvc.perform(options(URL)
                        .header("Origin", "http://localhost:5173")
                        .header("Access-Control-Request-Method", "POST")
                        .header("Access-Control-Request-Headers", "content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"));
    }

    @Test
    void 다른_출처의_CORS_사전_요청은_거절한다() throws Exception {
        mockMvc.perform(options(URL)
                        .header("Origin", "http://evil.example")
                        .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden());
    }
}
