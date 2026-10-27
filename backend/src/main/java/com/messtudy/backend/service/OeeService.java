package com.messtudy.backend.service;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAccessor;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Function;

import org.springframework.stereotype.Service;

import com.messtudy.backend.mapper.MasterDataMapper;
import com.messtudy.backend.mapper.OeeMapper;
import com.messtudy.backend.mapper.WorkOrderMapper;

/**
 * OEE(설비 종합 효율) = 가동률 × 성능 × 품질. 계산식은 docs/plans/oee.md 3장.
 * - 계획 가동 시간은 작업지시가 있던 초만 센다(지시 없는 대기는 계획 정지, 앞 공정을 기다린 대기는 가동률 손실).
 * - 라인 OEE = 포장기(마지막 공정) 양품 × 병목(가장 긴) 기준 택트 ÷ 라인 계획 가동 시간.
 * SQL은 초 · 개수 합계만 내고, 비율은 여기서 계산한다. 분모가 0이면 그 값은 null(화면에서 "–").
 */
@Service
public class OeeService {

    static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

    /** 조회 구간: 시작 시각을 정하는 방법과 추이 칸 크기(초) */
    enum Range {
        TODAY("today", 3600),
        LAST_1H("1h", 300),
        LAST_8H("8h", 3600);

        final String code;
        final int bucketSec;

        Range(String code, int bucketSec) {
            this.code = code;
            this.bucketSec = bucketSec;
        }

        static Range of(String code) {
            for (Range range : values()) {
                if (range.code.equals(code)) {
                    return range;
                }
            }
            throw new InvalidPayloadException("range: today · 1h · 8h 중 하나여야 합니다(" + code + ")");
        }

        OffsetDateTime from(OffsetDateTime now) {
            return switch (this) {
                case TODAY -> now.atZoneSameInstant(ZONE).truncatedTo(ChronoUnit.DAYS).toOffsetDateTime();
                case LAST_1H -> now.minusHours(1);
                case LAST_8H -> now.minusHours(8);
            };
        }
    }

    private final OeeMapper oeeMapper;
    private final MasterDataMapper masterDataMapper;
    private final WorkOrderMapper workOrderMapper;

    public OeeService(OeeMapper oeeMapper, MasterDataMapper masterDataMapper, WorkOrderMapper workOrderMapper) {
        this.oeeMapper = oeeMapper;
        this.masterDataMapper = masterDataMapper;
        this.workOrderMapper = workOrderMapper;
    }

    /**
     * 구간의 라인 OEE와 설비별 분해.
     *
     * @param rangeCode today · 1h · 8h
     * @return from, to, line, equipment
     * @throws InvalidPayloadException 알 수 없는 구간
     */
    public Map<String, Object> summary(String rangeCode) {
        Range range = Range.of(rangeCode);
        OffsetDateTime to = OffsetDateTime.now(ZONE);
        OffsetDateTime from = range.from(to);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("from", from);
        result.put("to", to);
        result.putAll(calculate(masterDataMapper.findEquipment(),
                oeeMapper.sumSeconds(from, to, null, null), oeeMapper.sumCounts(from, to, null, null)));
        return result;
    }

    /**
     * 시각 칸마다 라인 OEE. 작업지시가 한 번도 없던 칸은 빠진다(화면에서 빈 칸).
     *
     * @return from, to, bucketSec, points[{bucketStart, plannedSec, goodCount, oee}]
     * @throws InvalidPayloadException 알 수 없는 구간
     */
    public Map<String, Object> trend(String rangeCode) {
        Range range = Range.of(rangeCode);
        OffsetDateTime to = OffsetDateTime.now(ZONE);
        OffsetDateTime from = range.from(to);
        List<Map<String, Object>> equipment = masterDataMapper.findEquipment();

        // 같은 칸끼리 모은다(두 조회의 시각 객체는 다를 수 있어 Instant로 맞춘다)
        Map<Instant, List<Map<String, Object>>> seconds = groupByBucket(oeeMapper.sumSeconds(from, to, null, range.bucketSec));
        Map<Instant, List<Map<String, Object>>> counts = groupByBucket(oeeMapper.sumCounts(from, to, null, range.bucketSec));

        List<Map<String, Object>> points = new ArrayList<>();
        seconds.forEach((bucket, rows) -> {
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("bucketStart", bucket.atZone(ZONE).toOffsetDateTime());
            point.putAll(line(equipment, rows, counts.getOrDefault(bucket, List.of())));
            points.add(point);
        });

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("from", from);
        result.put("to", to);
        result.put("bucketSec", range.bucketSec);
        result.put("points", points);
        return result;
    }

    /**
     * 작업지시 하나의 OEE(그 지시가 진행 중이던 시간만).
     *
     * @return workOrderId, from(시작), to(완료, 진행 중이면 null), line, equipment
     * @throws NotFoundException 없는 작업지시
     */
    public Map<String, Object> forWorkOrder(String workOrderId) {
        Map<String, Object> workOrder = workOrderMapper.findById(workOrderId);
        if (workOrder == null) {
            throw new NotFoundException("작업지시가 없습니다(" + workOrderId + ")");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("workOrderId", workOrderId);
        result.put("from", workOrder.get("startedAt"));
        result.put("to", workOrder.get("completedAt"));
        result.putAll(calculate(masterDataMapper.findEquipment(),
                oeeMapper.sumSeconds(null, null, workOrderId, null), oeeMapper.sumCounts(null, null, workOrderId, null)));
        return result;
    }

    // ── 계산 ─────────────────────────────────────────────────

    /**
     * @param equipment 설비 기준정보(라인 순서대로): equipmentId, equipmentName, lineOrder, standardTactSec
     * @param seconds   설비별 plannedSec · runSec · downSec · idleSec(없는 설비는 0)
     * @param counts    설비별 goodCount · badCount(없는 설비는 0)
     * @return line, equipment
     */
    static Map<String, Object> calculate(List<Map<String, Object>> equipment,
            List<Map<String, Object>> seconds, List<Map<String, Object>> counts) {
        Map<String, Map<String, Object>> secondsById = byEquipment(seconds);
        Map<String, Map<String, Object>> countsById = byEquipment(counts);

        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, Object> eq : equipment) {
            String id = (String) eq.get("equipmentId");
            Map<String, Object> sec = secondsById.getOrDefault(id, Map.of());
            Map<String, Object> cnt = countsById.getOrDefault(id, Map.of());
            long tact = number(eq, "standardTactSec");
            long planned = number(sec, "plannedSec");
            long run = number(sec, "runSec");
            long down = number(sec, "downSec");
            long idle = number(sec, "idleSec");
            long good = number(cnt, "goodCount");
            long bad = number(cnt, "badCount");
            long total = good + bad;

            Double availability = ratio(run, planned);
            Double performance = ratio(tact * total, run);
            Double quality = ratio(good, total);

            Map<String, Object> loss = new LinkedHashMap<>();
            loss.put("downSec", down);
            loss.put("idleSec", idle);
            loss.put("speedSec", Math.max(0, run - tact * total));
            loss.put("defectSec", tact * bad);

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("equipmentId", id);
            row.put("equipmentName", eq.get("equipmentName"));
            row.put("lineOrder", eq.get("lineOrder"));
            row.put("standardTactSec", tact);
            row.put("plannedSec", planned);
            row.put("runSec", run);
            row.put("downSec", down);
            row.put("idleSec", idle);
            row.put("totalCount", total);
            row.put("goodCount", good);
            row.put("badCount", bad);
            row.put("availability", availability);
            row.put("performance", performance);
            row.put("quality", quality);
            row.put("oee", availability == null || performance == null || quality == null
                    ? null : availability * performance * quality);
            row.put("loss", loss);
            rows.add(row);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("line", line(equipment, seconds, counts));
        result.put("equipment", rows);
        return result;
    }

    /** 라인 OEE: 포장기(마지막 공정) 양품 × 병목 기준 택트 ÷ 라인 계획 가동 초(설비 중 가장 큰 값) */
    static Map<String, Object> line(List<Map<String, Object>> equipment,
            List<Map<String, Object>> seconds, List<Map<String, Object>> counts) {
        Map<String, Object> last = equipment.get(equipment.size() - 1);
        Map<String, Object> bottleneck = equipment.get(0);
        for (Map<String, Object> eq : equipment) {
            if (number(eq, "standardTactSec") > number(bottleneck, "standardTactSec")) {
                bottleneck = eq;
            }
        }
        long planned = seconds.stream().mapToLong(row -> number(row, "plannedSec")).max().orElse(0);
        long good = number(byEquipment(counts).getOrDefault((String) last.get("equipmentId"), Map.of()), "goodCount");
        long tact = number(bottleneck, "standardTactSec");

        Map<String, Object> line = new LinkedHashMap<>();
        line.put("oee", ratio(good * tact, planned));
        line.put("plannedSec", planned);
        line.put("goodCount", good);
        line.put("bottleneckEquipmentId", bottleneck.get("equipmentId"));
        line.put("bottleneckTactSec", tact);
        return line;
    }

    /** 분모가 0이면 null, 아니면 최대 1로 자른 비율(구간 경계에 걸친 1개 때문에 1을 조금 넘을 수 있다) */
    static Double ratio(long numerator, long denominator) {
        return denominator <= 0 ? null : Math.min(1.0, (double) numerator / denominator);
    }

    private static long number(Map<String, Object> map, String key) {
        return map.get(key) instanceof Number n ? n.longValue() : 0;
    }

    private static Map<String, Map<String, Object>> byEquipment(List<Map<String, Object>> rows) {
        Map<String, Map<String, Object>> map = new HashMap<>();
        rows.forEach(row -> map.put((String) row.get("equipmentId"), row));
        return map;
    }

    private static Map<Instant, List<Map<String, Object>>> groupByBucket(List<Map<String, Object>> rows) {
        Map<Instant, List<Map<String, Object>>> map = new TreeMap<>();
        Function<Object, Instant> toInstant = value -> value instanceof java.util.Date date
                ? date.toInstant() : Instant.from((TemporalAccessor) value);
        rows.forEach(row -> map.computeIfAbsent(toInstant.apply(row.get("bucketStart")), k -> new ArrayList<>()).add(row));
        return map;
    }
}
