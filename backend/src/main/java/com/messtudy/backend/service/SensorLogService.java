package com.messtudy.backend.service;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.messtudy.backend.mapper.ProductionPerformanceMapper;
import com.messtudy.backend.mapper.SensorLogMapper;

/**
 * 설비 데이터 한 묶음을 받아 센서 로그(metrics · status)와 생산 실적(production)으로 나눠 저장한다.
 * 실적이 늘었으면 늘어난 만큼 생산 이벤트도 남긴다(OEE 구간 생산 수).
 * 모두 한 트랜잭션이라, 하나가 실패하면 아무것도 저장되지 않는다.
 */
@Service
public class SensorLogService {

    private final SensorLogMapper sensorLogMapper;
    private final ProductionPerformanceMapper productionPerformanceMapper;

    public SensorLogService(SensorLogMapper sensorLogMapper, ProductionPerformanceMapper productionPerformanceMapper) {
        this.sensorLogMapper = sensorLogMapper;
        this.productionPerformanceMapper = productionPerformanceMapper;
    }

    /**
     * @param payload 설비별 데이터 목록(equipmentId, timestamp, status, workOrderId, metrics, production).
     *                진행 중 작업지시가 없을 때는 workOrderId · production을 둘 다 뺀다
     * @return 저장한 건수 {"sensorLogs": 넣은 센서 로그 수, "productions": 추가 · 갱신한 실적 수}.
     *         생산 이벤트 수는 세지 않는다(실적 저장의 부산물)
     * @throws InvalidPayloadException 필수 값이 없거나 형식이 틀렸을 때(아무것도 저장하지 않는다)
     */
    @Transactional
    public Map<String, Integer> save(List<Map<String, Object>> payload) {
        if (payload == null || payload.isEmpty()) {
            return result(0, 0);
        }

        List<Map<String, Object>> sensorLogs = new ArrayList<>();
        // 같은 (작업지시, 장비)가 한 요청에 두 번 있으면 UPSERT가 오류를 내므로 마지막 값만 남긴다
        Map<String, Map<String, Object>> productions = new LinkedHashMap<>();

        for (int i = 0; i < payload.size(); i++) {
            Map<String, Object> item = payload.get(i);
            if (item == null) {
                throw new InvalidPayloadException("[" + i + "] 항목이 비어 있습니다");
            }
            String where = "[" + i + "]";
            sensorLogs.add(toSensorLog(item, where));
            // 진행 중 작업지시가 없으면(설비 대기) workOrderId · production 없이 센서 로그만 온다
            if (item.get("workOrderId") == null && item.get("production") == null) {
                continue;
            }
            Map<String, Object> production = toProduction(item, where);
            productions.put(production.get("workOrderId") + "|" + production.get("equipmentId"), production);
        }

        int savedLogs = sensorLogMapper.insertAll(sensorLogs);
        int savedProductions = 0;
        if (!productions.isEmpty()) {
            List<Map<String, Object>> rows = new ArrayList<>(productions.values());
            // 이벤트는 저장값과 비교해 만들므로 UPSERT로 저장값이 바뀌기 전에 넣는다
            productionPerformanceMapper.insertEvents(rows);
            savedProductions = productionPerformanceMapper.upsertAll(rows);
        }
        return result(savedLogs, savedProductions);
    }

    private Map<String, Object> toSensorLog(Map<String, Object> item, String where) {
        Map<String, Object> metrics = requireMap(item, "metrics", where);
        // temperature · vibration 열은 NULL을 허용하므로 값이 없으면 null로 넣는다(Map.of는 null을 못 담는다)
        Map<String, Object> log = new HashMap<>();
        log.put("equipmentId", requireText(item, "equipmentId", where));
        log.put("recordedAt", requireTimestamp(item, "timestamp", where));
        log.put("status", requireText(item, "status", where));
        // 작업지시가 없으면(대기) null: 계획 가동 시간에서 빠진다
        log.put("workOrderId", item.get("workOrderId") == null ? null : requireText(item, "workOrderId", where));
        log.put("temperature", optionalDecimal(metrics, "temperature", where + ".metrics"));
        log.put("vibration", optionalDecimal(metrics, "vibration", where + ".metrics"));
        return log;
    }

    private Map<String, Object> toProduction(Map<String, Object> item, String where) {
        Map<String, Object> production = requireMap(item, "production", where);
        String at = where + ".production";
        return Map.of(
                "workOrderId", requireText(item, "workOrderId", where),
                "equipmentId", requireText(item, "equipmentId", where),
                "occurredAt", requireTimestamp(item, "timestamp", where),
                "totalCount", requireCount(production, "totalCount", at),
                "goodCount", requireCount(production, "goodCount", at),
                "badCount", requireCount(production, "badCount", at));
    }

    private static Map<String, Integer> result(int sensorLogs, int productions) {
        return Map.of("sensorLogs", sensorLogs, "productions", productions);
    }

    // ── 값 꺼내기 · 검사 ─────────────────────────────────────

    private static String requireText(Map<String, Object> map, String key, String where) {
        if (map.get(key) instanceof String text && !text.isBlank()) {
            return text;
        }
        throw new InvalidPayloadException(where + "." + key + ": 문자열 값이 필요합니다");
    }

    private static OffsetDateTime requireTimestamp(Map<String, Object> map, String key, String where) {
        String text = requireText(map, key, where);
        try {
            return OffsetDateTime.parse(text);
        } catch (DateTimeParseException e) {
            throw new InvalidPayloadException(where + "." + key + ": ISO 시각 형식이 아닙니다(" + text + ")");
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> requireMap(Map<String, Object> map, String key, String where) {
        if (map.get(key) instanceof Map<?, ?> child) {
            return (Map<String, Object>) child;
        }
        throw new InvalidPayloadException(where + "." + key + ": 객체 값이 필요합니다");
    }

    private static BigDecimal optionalDecimal(Map<String, Object> map, String key, String where) {
        Object value = map.get(key);
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return new BigDecimal(number.toString());
        }
        throw new InvalidPayloadException(where + "." + key + ": 숫자 값이 필요합니다");
    }

    private static int requireCount(Map<String, Object> map, String key, String where) {
        if (map.get(key) instanceof Number number) {
            BigDecimal decimal = new BigDecimal(number.toString());
            if (decimal.signum() >= 0 && decimal.stripTrailingZeros().scale() <= 0) {
                try {
                    return decimal.intValueExact();
                } catch (ArithmeticException ignored) {
                    // int 범위를 넘으면 아래에서 형식 오류로 처리한다
                }
            }
        }
        throw new InvalidPayloadException(where + "." + key + ": 0 이상의 정수가 필요합니다");
    }
}
