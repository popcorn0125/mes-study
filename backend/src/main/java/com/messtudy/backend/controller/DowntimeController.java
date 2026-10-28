package com.messtudy.backend.controller;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.messtudy.backend.service.DowntimeService;

/** 비가동 API. 구간(range)은 OEE와 같은 today · 1h · 8h, 그 밖의 값은 400 */
@RestController
public class DowntimeController {

    private final DowntimeService downtimeService;

    public DowntimeController(DowntimeService downtimeService) {
        this.downtimeService = downtimeService;
    }

    /** 비가동 사유 목록(대분류 · 순서) */
    @GetMapping("/api/v1/downtime-reasons")
    public List<Map<String, Object>> reasons() {
        return downtimeService.reasons();
    }

    /** 정지 요약과 사유 파레토. 예: GET /api/v1/downtimes/summary?range=1h */
    @GetMapping("/api/v1/downtimes/summary")
    public Map<String, Object> summary(@RequestParam(defaultValue = "today") String range) {
        return downtimeService.summary(range);
    }

    /** 60초 이상이거나 진행 중인 정지 목록. 예: GET /api/v1/downtimes?range=today&pending=true */
    @GetMapping("/api/v1/downtimes")
    public Map<String, Object> list(@RequestParam(defaultValue = "today") String range,
            @RequestParam(defaultValue = "false") boolean pending) {
        return downtimeService.list(range, pending);
    }

    /** 사유 입력 · 고치기. 본문: {reasonCode, enteredBy}. 없는 정지 404, 없는 사유 · 빈 입력자 400 */
    @PutMapping("/api/v1/downtimes/{id}/reason")
    public Map<String, Object> setReason(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return downtimeService.setReason(id, body);
    }
}
