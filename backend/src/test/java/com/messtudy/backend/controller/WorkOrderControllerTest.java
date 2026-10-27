package com.messtudy.backend.controller;

import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

import com.messtudy.backend.service.NotFoundException;
import com.messtudy.backend.service.StateConflictException;
import com.messtudy.backend.service.WorkOrderService;

/** DB 없이 응답 코드(201 · 204 · 404 · 409)와 파라미터 형식만 확인한다(서비스는 가짜). */
@WebMvcTest(WorkOrderController.class)
class WorkOrderControllerTest {

    private static final String URL = "/api/v1/work-orders";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private WorkOrderService workOrderService;

    @Test
    void 등록하면_201이다() throws Exception {
        given(workOrderService.create(anyMap())).willReturn(Map.of("workOrderId", "WO-20261028-001", "status", "PLANNED"));

        mockMvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content("{\"itemCode\":\"MOTOR_A\",\"plannedQty\":20}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.workOrderId").value("WO-20261028-001"));
    }

    @Test
    void 상태는_여러_개를_반복_파라미터로_거른다() throws Exception {
        given(workOrderService.findAll(List.of("RELEASED", "HELD"))).willReturn(List.of(Map.of("workOrderId", "WO-1")));

        mockMvc.perform(get(URL).param("status", "RELEASED").param("status", "HELD"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].workOrderId").value("WO-1"));
    }

    @Test
    void 진행_중_지시가_없으면_204다() throws Exception {
        given(workOrderService.findCurrent()).willReturn(null);

        mockMvc.perform(get(URL + "/current")).andExpect(status().isNoContent());
    }

    @Test
    void 없는_지시는_404_할_수_없는_전환은_409다() throws Exception {
        given(workOrderService.findById("WO-NONE")).willThrow(new NotFoundException("작업지시가 없습니다(WO-NONE)"));
        given(workOrderService.hold("WO-1")).willThrow(new StateConflictException("완료 상태인 작업지시는 보류할 수 없습니다(WO-1)"));

        mockMvc.perform(get(URL + "/WO-NONE")).andExpect(status().isNotFound());
        mockMvc.perform(post(URL + "/WO-1/hold"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("완료 상태인 작업지시는 보류할 수 없습니다(WO-1)"));
    }
}
