package com.messtudy.backend.service;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * 설비가 1초마다 보내는 센서 값 한 건(원본). DB에는 넣지 않고 1분 요약 · 최근 10분 버퍼 · 스풀 파일로 나눠 담는다.
 *
 * @param workOrderId 작업지시가 없으면(설비 대기) null
 * @param temperature 없으면 null
 * @param vibration   없으면 null
 * @param alarmCode   알람 고장(DOWN)일 때만, 없으면 null
 */
public record SensorReading(String equipmentId, Instant recordedAt, String status, String workOrderId,
        BigDecimal temperature, BigDecimal vibration, String alarmCode) {
}
