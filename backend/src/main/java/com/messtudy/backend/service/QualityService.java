package com.messtudy.backend.service;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import org.springframework.stereotype.Service;

import com.messtudy.backend.mapper.MasterDataMapper;
import com.messtudy.backend.mapper.OeeMapper;
import com.messtudy.backend.mapper.QualityMapper;

/**
 * 품질: 직행률 · 양품률 · 공정별 합격률 · 불량 유형 파레토 · 작업지시별 불량. 계산식은 docs/plans/quality.md 4장.
 * 구간은 OEE와 같다(OeeService.Range). 설비별 양품 · 불량 수는 OEE와 같은 합계(OeeMapper.sumCounts)를 쓴다.
 * SQL은 합계만 내고, 비율은 여기서 계산한다. 분모가 0이면 그 값은 null(화면에서 "–").
 */
@Service
public class QualityService {

    /** 이 기능 전에 난 불량(유형 없음)을 파레토에 보여 줄 이름 */
    static final String UNCLASSIFIED = "미분류";

    private final QualityMapper qualityMapper;
    private final OeeMapper oeeMapper;
    private final MasterDataMapper masterDataMapper;

    public QualityService(QualityMapper qualityMapper, OeeMapper oeeMapper, MasterDataMapper masterDataMapper) {
        this.qualityMapper = qualityMapper;
        this.oeeMapper = oeeMapper;
        this.masterDataMapper = masterDataMapper;
    }

    /**
     * 구간의 품질 요약.
     *
     * @param rangeCode today · 1h · 8h
     * @return from, to, summary, equipment, defects, workOrders
     * @throws InvalidPayloadException 알 수 없는 구간
     */
    public Map<String, Object> summary(String rangeCode) {
        OeeService.Range range = OeeService.Range.of(rangeCode);
        OffsetDateTime to = OffsetDateTime.now(OeeService.ZONE);
        OffsetDateTime from = range.from(to);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("from", from);
        result.put("to", to);
        result.putAll(calculate(masterDataMapper.findEquipment(),
                oeeMapper.sumCounts(from, to, null, null), qualityMapper.sumDefects(from, to)));
        result.put("workOrders", qualityMapper.sumByWorkOrder(from, to));
        return result;
    }

    /**
     * 시각 칸마다 불량률(전 공정 불량 ÷ 전 공정 생산). 생산이 없던 칸은 빠진다(화면에서 빈 칸).
     *
     * @return from, to, bucketSec, points[{bucketStart, totalCount, badCount, defectRate}]
     * @throws InvalidPayloadException 알 수 없는 구간
     */
    public Map<String, Object> trend(String rangeCode) {
        OeeService.Range range = OeeService.Range.of(rangeCode);
        OffsetDateTime to = OffsetDateTime.now(OeeService.ZONE);
        OffsetDateTime from = range.from(to);

        // 칸마다 [생산, 불량]. 시각 객체 종류가 섞일 수 있어 OEE 추이처럼 Instant로 맞춘다
        Map<Instant, long[]> buckets = new TreeMap<>();
        for (Map<String, Object> row : oeeMapper.sumCounts(from, to, null, range.bucketSec)) {
            long[] sum = buckets.computeIfAbsent(OeeService.toInstant(row.get("bucketStart")), k -> new long[2]);
            long bad = number(row, "badCount");
            sum[0] += number(row, "goodCount") + bad;
            sum[1] += bad;
        }
        List<Map<String, Object>> points = new ArrayList<>();
        buckets.forEach((bucket, sum) -> {
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("bucketStart", bucket.atZone(OeeService.ZONE).toOffsetDateTime());
            point.put("totalCount", sum[0]);
            point.put("badCount", sum[1]);
            point.put("defectRate", OeeService.ratio(sum[1], sum[0]));
            points.add(point);
        });

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("from", from);
        result.put("to", to);
        result.put("bucketSec", range.bucketSec);
        result.put("points", points);
        return result;
    }

    // ── 계산 ─────────────────────────────────────────────────

    /**
     * @param equipment 설비 기준정보(라인 순서대로): equipmentId, equipmentName, lineOrder
     * @param counts    설비별 goodCount · badCount(없는 설비는 0)
     * @param defects   유형별 불량 수(많은 순): defectCode, defectName, equipmentId, equipmentName, count
     * @return summary, equipment, defects(미분류를 맨 뒤에 더하고 누적 비율을 붙인 것)
     */
    static Map<String, Object> calculate(List<Map<String, Object>> equipment,
            List<Map<String, Object>> counts, List<Map<String, Object>> defects) {
        Map<String, Map<String, Object>> countsById = new HashMap<>();
        counts.forEach(row -> countsById.put((String) row.get("equipmentId"), row));

        List<Map<String, Object>> rows = new ArrayList<>();
        Double fpy = null;
        long badTotal = 0;
        for (Map<String, Object> eq : equipment) {
            Map<String, Object> cnt = countsById.getOrDefault((String) eq.get("equipmentId"), Map.of());
            long good = number(cnt, "goodCount");
            long bad = number(cnt, "badCount");
            Double passRate = OeeService.ratio(good, good + bad);
            // 생산이 없는 공정은 곱에서 뺀다(모두 없으면 null)
            if (passRate != null) {
                fpy = fpy == null ? passRate : fpy * passRate;
            }
            badTotal += bad;

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("equipmentId", eq.get("equipmentId"));
            row.put("equipmentName", eq.get("equipmentName"));
            row.put("lineOrder", eq.get("lineOrder"));
            row.put("totalCount", good + bad);
            row.put("goodCount", good);
            row.put("badCount", bad);
            row.put("passRate", passRate);
            rows.add(row);
        }
        long finished = number(countsById.getOrDefault((String) equipment.get(equipment.size() - 1).get("equipmentId"), Map.of()),
                "goodCount");

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("fpy", fpy);
        summary.put("yield", OeeService.ratio(finished, finished + badTotal));
        summary.put("badCount", badTotal);
        summary.put("finishedCount", finished);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("summary", summary);
        result.put("equipment", rows);
        result.put("defects", pareto(defects, badTotal));
        return result;
    }

    /**
     * 유형별 불량(많은 순)에 미분류(전체 불량 − 유형 있는 불량, 0보다 크면)를 맨 뒤에 더하고 누적 비율을 붙인다.
     * 미분류는 개수와 상관없이 맨 뒤다(원인을 모르는 불량이라 개선 순서에 넣지 않는다).
     */
    static List<Map<String, Object>> pareto(List<Map<String, Object>> defects, long badTotal) {
        List<Map<String, Object>> rows = new ArrayList<>();
        defects.forEach(row -> rows.add(new LinkedHashMap<>(row)));
        long classified = rows.stream().mapToLong(row -> number(row, "count")).sum();
        if (badTotal > classified) {
            Map<String, Object> unclassified = new LinkedHashMap<>();
            unclassified.put("defectCode", null);
            unclassified.put("defectName", UNCLASSIFIED);
            unclassified.put("equipmentId", null);
            unclassified.put("equipmentName", null);
            unclassified.put("count", badTotal - classified);
            rows.add(unclassified);
        }
        long total = Math.max(badTotal, classified);
        long running = 0;
        for (Map<String, Object> row : rows) {
            running += number(row, "count");
            row.put("count", number(row, "count"));
            row.put("cumulativeRatio", OeeService.ratio(running, total));
        }
        return rows;
    }

    private static long number(Map<String, Object> map, String key) {
        return map.get(key) instanceof Number n ? n.longValue() : 0;
    }
}
