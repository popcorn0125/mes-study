package com.messtudy.backend.controller;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.messtudy.backend.service.QualityService;

/** 품질 조회 API. 구간(range)은 OEE와 같은 today · 1h · 8h, 그 밖의 값은 400 */
@RestController
public class QualityController {

    private final QualityService qualityService;

    public QualityController(QualityService qualityService) {
        this.qualityService = qualityService;
    }

    /** 직행률 · 양품률 · 공정별 합격률 · 불량 유형 파레토 · 작업지시별 불량. 예: GET /api/v1/quality?range=1h */
    @GetMapping("/api/v1/quality")
    public Map<String, Object> summary(@RequestParam(defaultValue = "today") String range) {
        return qualityService.summary(range);
    }

    /** 시각 칸(1시간은 5분, 그 밖은 1시간)마다 불량률. 예: GET /api/v1/quality/trend?range=8h */
    @GetMapping("/api/v1/quality/trend")
    public Map<String, Object> trend(@RequestParam(defaultValue = "today") String range) {
        return qualityService.trend(range);
    }
}
