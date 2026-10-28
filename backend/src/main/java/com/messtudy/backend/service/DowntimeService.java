package com.messtudy.backend.service;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.messtudy.backend.mapper.DowntimeQueryMapper;

/**
 * 비가동: 사유 목록, 구간의 정지 요약 · 사유 파레토 · 정지 목록, 작업자 사유 입력. 계획은 docs/plans/downtime.md.
 * 정지 한 건은 수신 때 SensorLogService가 만든다. 구간은 OEE와 같다(OeeService.Range).
 */
@Service
public class DowntimeService {

    /** 이만큼(초) 이상 멈춘 정지부터 사유를 받는다. 그보다 짧고 사유 없는 정지는 순간 정지 */
    static final int REASON_REQUIRED_SEC = 60;
    /** 목록 최대 건수 */
    static final int LIST_LIMIT = 100;
    static final String PENDING = "사유 미입력";
    static final String MICRO = "순간 정지";
    /** 입력자 이름 최대 길이(downtime.reason_by) */
    private static final int MAX_NAME = 100;

    private final DowntimeQueryMapper mapper;

    public DowntimeService(DowntimeQueryMapper mapper) {
        this.mapper = mapper;
    }

    /** @return 사유 목록(대분류 · 순서): reasonCode, category, reasonName */
    public List<Map<String, Object>> reasons() {
        return mapper.findReasons();
    }

    /**
     * @param rangeCode today · 1h · 8h
     * @return from, to, summary{downSec, stopCount, pendingCount, microSec}, reasons(파레토)
     * @throws InvalidPayloadException 알 수 없는 구간
     */
    public Map<String, Object> summary(String rangeCode) {
        OeeService.Range range = OeeService.Range.of(rangeCode);
        OffsetDateTime to = OffsetDateTime.now(OeeService.ZONE);
        OffsetDateTime from = range.from(to);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("from", from);
        result.put("to", to);
        result.putAll(calculate(mapper.sumByKind(from, to, REASON_REQUIRED_SEC)));
        return result;
    }

    /**
     * @param pendingOnly 사유 없는 정지만
     * @return from, to, downtimes(60초 이상이거나 진행 중인 정지, 진행 중 먼저 · 최근 시작 순)
     */
    public Map<String, Object> list(String rangeCode, boolean pendingOnly) {
        OeeService.Range range = OeeService.Range.of(rangeCode);
        OffsetDateTime to = OffsetDateTime.now(OeeService.ZONE);
        OffsetDateTime from = range.from(to);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("from", from);
        result.put("to", to);
        result.put("downtimes", mapper.findAll(from, to, REASON_REQUIRED_SEC, pendingOnly, LIST_LIMIT));
        return result;
    }

    /**
     * 작업자가 사유를 넣거나 자동 사유를 고친다. 알람 코드는 그대로 남는다.
     *
     * @param body {reasonCode, enteredBy}
     * @return 고친 정지
     * @throws NotFoundException 없는 정지
     * @throws InvalidPayloadException 없는 사유, 빈 입력자
     */
    @Transactional
    public Map<String, Object> setReason(long id, Map<String, Object> body) {
        Map<String, Object> input = body == null ? Map.of() : body;
        if (!(input.get("reasonCode") instanceof String reasonCode)
                || reasons().stream().noneMatch(r -> reasonCode.equals(r.get("reasonCode")))) {
            throw new InvalidPayloadException("reasonCode: 비가동 사유 목록에 있는 코드여야 합니다(" + input.get("reasonCode") + ")");
        }
        if (!(input.get("enteredBy") instanceof String enteredBy) || enteredBy.isBlank() || enteredBy.strip().length() > MAX_NAME) {
            throw new InvalidPayloadException("enteredBy: 입력자 이름이 필요합니다(" + MAX_NAME + "자 이하)");
        }
        if (mapper.updateReason(id, reasonCode, enteredBy.strip()) == 0) {
            throw new NotFoundException("정지 " + id + "을(를) 찾을 수 없습니다");
        }
        return mapper.findById(id);
    }

    // ── 계산 ─────────────────────────────────────────────────

    /**
     * @param kinds sumByKind 결과(순서 없음)
     * @return summary, reasons(사유는 시간 많은 순 → 사유 미입력 → 순간 정지, 누적 비율을 붙인 것)
     */
    static Map<String, Object> calculate(List<Map<String, Object>> kinds) {
        List<Map<String, Object>> reasons = new ArrayList<>();
        Map<String, Object> pending = null;
        Map<String, Object> micro = null;
        for (Map<String, Object> row : kinds) {
            Map<String, Object> bar = new LinkedHashMap<>();
            String kind = (String) row.get("kind");
            boolean reason = "REASON".equals(kind);
            bar.put("reasonCode", reason ? row.get("reasonCode") : null);
            bar.put("reasonName", reason ? row.get("reasonName") : "PENDING".equals(kind) ? PENDING : MICRO);
            bar.put("category", reason ? row.get("category") : null);
            bar.put("kind", kind);
            bar.put("seconds", number(row, "seconds"));
            bar.put("count", number(row, "count"));
            bar.put("displayOrder", reason ? number(row, "displayOrder") : 0);
            switch (kind) {
                case "REASON" -> reasons.add(bar);
                case "PENDING" -> pending = bar;
                default -> micro = bar;
            }
        }
        reasons.sort(Comparator.<Map<String, Object>>comparingLong(r -> -(long) r.get("seconds"))
                .thenComparingLong(r -> (long) r.get("displayOrder")));
        long reasonSec = reasons.stream().mapToLong(r -> (long) r.get("seconds")).sum();
        long reasonCount = reasons.stream().mapToLong(r -> (long) r.get("count")).sum();
        if (pending != null) {
            reasons.add(pending);
        }
        if (micro != null) {
            reasons.add(micro);
        }
        long downSec = reasons.stream().mapToLong(r -> (long) r.get("seconds")).sum();
        long running = 0;
        for (Map<String, Object> bar : reasons) {
            bar.remove("displayOrder");
            running += (long) bar.get("seconds");
            bar.put("cumulativeRatio", OeeService.ratio(running, downSec));
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("downSec", downSec);
        summary.put("stopCount", reasonCount + (pending == null ? 0 : (long) pending.get("count")));
        summary.put("pendingCount", pending == null ? 0L : pending.get("count"));
        summary.put("pendingSec", pending == null ? 0L : pending.get("seconds"));
        summary.put("microSec", micro == null ? 0L : micro.get("seconds"));
        summary.put("reasonSec", reasonSec);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("summary", summary);
        result.put("reasons", reasons);
        return result;
    }

    private static long number(Map<String, Object> map, String key) {
        return map.get(key) instanceof Number n ? n.longValue() : 0;
    }
}
