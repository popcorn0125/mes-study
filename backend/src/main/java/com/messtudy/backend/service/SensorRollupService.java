package com.messtudy.backend.service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.messtudy.backend.mapper.SensorMinuteMapper;
import com.messtudy.backend.mapper.StatusChangeMapper;

/**
 * 1분 요약을 DB에 넣고(플러시), 서버를 다시 띄울 때 스풀로 되살리고(복구), DB 요약 + 아직 안 넣은 메모리 버킷을 합쳐 조회한다.
 * docs/plans/sensor-rollup.md 4 · 6장.
 */
@Service
public class SensorRollupService {

    private static final Logger log = LoggerFactory.getLogger(SensorRollupService.class);

    /** 한 INSERT에 넣는 요약 행 수(행마다 파라미터 20개 → 2만 개, PostgreSQL 한도 65,535 안쪽) */
    static final int BATCH = 1000;
    /** 1시간이 끝나고 이만큼 기다린 뒤 Parquet으로 바꾼다(늦게 오는 행을 스풀에 더 받는다) */
    static final Duration ARCHIVE_GRACE = Duration.ofMinutes(2);
    /** OEE 추이 칸의 기준 시각(OeeMapper · SensorMinuteMapper의 date_bin과 같다) */
    private static final Instant BUCKET_ORIGIN = OffsetDateTime.parse("2000-01-01T00:00:00+09:00").toInstant();

    private final SensorAggregator aggregator;
    private final SensorArchive archive;
    private final SensorMinuteMapper sensorMinuteMapper;
    private final StatusChangeMapper statusChangeMapper;
    private final Duration flushGrace;

    public SensorRollupService(SensorAggregator aggregator, SensorArchive archive, SensorMinuteMapper sensorMinuteMapper,
            StatusChangeMapper statusChangeMapper, @Value("${mes.sensor.flush-grace-sec:5}") long flushGraceSec) {
        this.aggregator = aggregator;
        this.archive = archive;
        this.sensorMinuteMapper = sensorMinuteMapper;
        this.statusChangeMapper = statusChangeMapper;
        this.flushGrace = Duration.ofSeconds(flushGraceSec);
    }

    // ── 플러시 · 아카이브 · 복구 ─────────────────────────────

    /** 끝난 분의 버킷을 DB에 합친다. 실패하면 버킷을 메모리로 돌려놓고 다음에 다시 넣는다 @return 넣은 행 수 */
    public int flush(Instant now) {
        return write(aggregator.drainClosed(now, flushGrace));
    }

    /** 열린 버킷까지 모두 넣는다(서버 종료) */
    public int flushAll() {
        return write(aggregator.drainAll());
    }

    /** 끝난 시간의 스풀을 Parquet으로 바꾼다 @return 만든 파일 수 */
    public int archive(Instant now) {
        return archive.convertClosed(now, ARCHIVE_GRACE).size();
    }

    /**
     * 서버를 띄울 때 한 번: 스풀이 남은 시간의 요약을 다시 집계해 덮어쓰고, 최근 10분 · 설비 상태를 되살린다.
     * 스풀에 없는 설비의 진행 중 이력은 요약의 마지막 시각 + 1초로 끝낸다(그 사이에는 받은 게 없다).
     *
     * @return 덮어쓴 요약 행 수
     */
    public int recover() {
        int rows = 0;
        for (LocalDateTime hour : new LinkedHashSet<>(archive.spools().values())) {
            List<Map<String, Object>> hourRows = archive.reaggregate(hour);
            for (int i = 0; i < hourRows.size(); i += BATCH) {
                rows += sensorMinuteMapper.overwrite(hourRows.subList(i, Math.min(i + BATCH, hourRows.size())));
            }
        }
        Map<String, Map<String, Object>> open = statusChangeMapper.findOpen().stream()
                .collect(Collectors.toMap(r -> (String) r.get("equipmentId"), r -> r));
        Map<String, List<SensorReading>> recent = archive.readRecent(SensorAggregator.RECENT).stream()
                .collect(Collectors.groupingBy(SensorReading::equipmentId, LinkedHashMap::new, Collectors.toList()));
        recent.forEach((equipmentId, readings) -> {
            Map<String, Object> row = open.get(equipmentId);
            aggregator.restore(equipmentId, readings, row == null ? null : (String) row.get("status"),
                    row == null ? null : OeeService.toInstant(row.get("startedAt")));
        });
        for (String equipmentId : open.keySet()) {
            if (!recent.containsKey(equipmentId)) {
                OffsetDateTime last = sensorMinuteMapper.findLastRecordedAt(equipmentId);
                statusChangeMapper.close(equipmentId, last == null
                        ? OffsetDateTime.ofInstant(OeeService.toInstant(open.get(equipmentId).get("startedAt")), ZoneOffset.UTC)
                        : last.plusSeconds(1));
            }
        }
        if (rows > 0 || !recent.isEmpty()) {
            log.info("센서 요약 복구: 스풀로 요약 {}행을 다시 만들고 설비 {}대의 최근 원본을 되살렸다", rows, recent.size());
        }
        return rows;
    }

    private int write(List<Map<String, Object>> rows) {
        int written = 0;
        for (int i = 0; i < rows.size(); i += BATCH) {
            List<Map<String, Object>> batch = rows.subList(i, Math.min(i + BATCH, rows.size()));
            try {
                written += sensorMinuteMapper.merge(batch);
            } catch (RuntimeException e) {
                aggregator.putBack(rows.subList(i, rows.size()));
                log.warn("센서 요약 {}행을 넣지 못해 메모리로 돌려놓았다(다음 플러시 때 다시 넣는다)", rows.size() - i, e);
                break;
            }
        }
        return written;
    }

    // ── 조회 (DB 요약 + 메모리) ─────────────────────────────

    /**
     * OEE용 상태 초. SensorMinuteMapper.sumSeconds 결과에 아직 안 넣은 버킷을 더한다.
     *
     * @return equipmentId, (bucketStart), plannedSec · runSec · downSec · idleSec
     */
    public List<Map<String, Object>> sumSeconds(OffsetDateTime from, OffsetDateTime to, String workOrderId, Integer bucketSec) {
        List<Map<String, Object>> rows = sensorMinuteMapper.sumSeconds(from, to, workOrderId, bucketSec);
        Instant fromMinute = from == null ? null : from.toInstant().truncatedTo(ChronoUnit.MINUTES);
        List<Map<String, Object>> pending = aggregator.pendingRows().stream().filter(row -> {
            String wo = (String) row.get("workOrderId");
            if (workOrderId != null) {
                return workOrderId.equals(wo);
            }
            Instant bucket = ((OffsetDateTime) row.get("bucketStart")).toInstant();
            return !wo.isEmpty() && !bucket.isBefore(fromMinute) && bucket.isBefore(to.toInstant());
        }).toList();
        return mergeSeconds(rows, pending, bucketSec);
    }

    /** 최근 minutes분 설비 · 상태별 초(0초인 상태는 뺀다). @return equipmentId, status, seconds */
    public List<Map<String, Object>> statusSeconds(int minutes) {
        Instant from = Instant.now().minus(Duration.ofMinutes(minutes));
        Map<String, long[]> sums = new LinkedHashMap<>();
        for (Map<String, Object> row : sensorMinuteMapper.sumStatusSeconds(OffsetDateTime.ofInstant(from, ZoneOffset.UTC))) {
            addStatus(sums, row);
        }
        Instant fromMinute = from.truncatedTo(ChronoUnit.MINUTES);
        for (Map<String, Object> row : aggregator.pendingRows()) {
            if (!((OffsetDateTime) row.get("bucketStart")).toInstant().isBefore(fromMinute)) {
                addStatus(sums, row);
            }
        }
        String[] statuses = { "RUN", "WARN", "DOWN", "IDLE" };
        List<Map<String, Object>> result = new ArrayList<>();
        sums.entrySet().stream().sorted(Map.Entry.comparingByKey()).forEach(e -> {
            // 상태 이름순(DOWN · IDLE · RUN · WARN)으로 원본 count 쿼리의 ORDER BY와 같게 둔다
            List<Map<String, Object>> rows = new ArrayList<>();
            for (int i = 0; i < statuses.length; i++) {
                if (e.getValue()[i] > 0) {
                    rows.add(Map.of("equipmentId", e.getKey(), "status", statuses[i], "seconds", e.getValue()[i]));
                }
            }
            rows.sort(Comparator.comparing(r -> (String) r.get("status")));
            result.addAll(rows);
        });
        return result;
    }

    /**
     * 설비 하나의 최근 minutes분 로그(시간순). 10분 이하는 메모리의 1초 원본, 넘거나 메모리가 비었으면 1분 요약(분마다 평균 1점).
     *
     * @return recordedAt, status, temperature, vibration
     */
    public List<Map<String, Object>> recentLogs(String equipmentId, int minutes) {
        Instant from = Instant.now().minus(Duration.ofMinutes(minutes));
        if (minutes <= SensorAggregator.RECENT.toMinutes()) {
            List<SensorReading> readings = aggregator.recent(equipmentId, from);
            if (!readings.isEmpty()) {
                return readings.stream().map(SensorRollupService::point).toList();
            }
        }
        List<Map<String, Object>> rows = new ArrayList<>(
                sensorMinuteMapper.findMinutes(equipmentId, OffsetDateTime.ofInstant(from, ZoneOffset.UTC)));
        Map<Instant, Map<String, Object>> byMinute = new LinkedHashMap<>();
        rows.forEach(row -> byMinute.put(OeeService.toInstant(row.get("recordedAt")), row));
        Instant fromMinute = from.truncatedTo(ChronoUnit.MINUTES);
        for (Map<String, Object> pending : aggregator.pendingRows()) {
            Instant bucket = ((OffsetDateTime) pending.get("bucketStart")).toInstant();
            if (equipmentId.equals(pending.get("equipmentId")) && !bucket.isBefore(fromMinute) && !byMinute.containsKey(bucket)) {
                Map<String, Object> point = new HashMap<>();
                point.put("recordedAt", pending.get("bucketStart"));
                point.put("status", pending.get("lastStatus"));
                point.put("temperature", average(pending, "temperature"));
                point.put("vibration", average(pending, "vibration"));
                byMinute.put(bucket, point);
            }
        }
        return byMinute.entrySet().stream().sorted(Map.Entry.comparingByKey()).map(Map.Entry::getValue).toList();
    }

    /** 설비마다 마지막 로그 1건: 메모리, 메모리에 없는 설비는 1분 요약의 마지막 값. @return equipmentId, recordedAt, status, temperature, vibration */
    public List<Map<String, Object>> latest() {
        Map<String, SensorReading> memory = aggregator.latest();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, Object> row : sensorMinuteMapper.findLastPerEquipment()) {
            SensorReading reading = memory.get((String) row.get("equipmentId"));
            if (reading == null) {
                rows.add(row);
            } else {
                Map<String, Object> fresh = point(reading);
                fresh.put("equipmentId", reading.equipmentId());
                rows.add(fresh);
            }
        }
        // 요약에 아직 한 번도 안 들어간(첫 1분 안의) 설비
        List<String> listed = rows.stream().map(r -> (String) r.get("equipmentId")).toList();
        memory.values().stream().filter(r -> !listed.contains(r.equipmentId()))
                .sorted(Comparator.comparing(SensorReading::equipmentId)).forEach(r -> {
                    Map<String, Object> fresh = point(r);
                    fresh.put("equipmentId", r.equipmentId());
                    rows.add(fresh);
                });
        rows.sort(Comparator.comparing(r -> (String) r.get("equipmentId")));
        return rows;
    }

    /**
     * 설비 하나의 최근 minutes분 상태 구간(최신부터). 첫 구간의 시작은 조회 시작으로 자른다.
     * 진행 중인 구간은 메모리의 마지막 시각을 본다: 5초 안에 받았으면 endedAt null, 아니면 마지막 시각 + 1초에 끝난 것으로 보인다.
     *
     * @return status, startedAt, endedAt, seconds
     */
    public List<Map<String, Object>> statusChanges(String equipmentId, int minutes) {
        Instant now = Instant.now();
        Instant from = now.minus(Duration.ofMinutes(minutes));
        SensorAggregator.Tracker tracker = aggregator.tracker(equipmentId);
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map<String, Object> row : statusChangeMapper.findSince(equipmentId, OffsetDateTime.ofInstant(from, ZoneOffset.UTC))) {
            Instant started = OeeService.toInstant(row.get("startedAt"));
            Instant ended = row.get("endedAt") == null ? null : OeeService.toInstant(row.get("endedAt"));
            if (ended == null && tracker != null && tracker.lastSeen().isBefore(now.minus(SensorAggregator.GAP))) {
                ended = tracker.lastSeen().plusSeconds(1);
            }
            Instant start = started.isBefore(from) ? from : started;
            Instant end = ended == null ? (tracker == null ? now : tracker.lastSeen().plusSeconds(1)) : ended;
            Map<String, Object> change = new LinkedHashMap<>();
            change.put("status", row.get("status"));
            change.put("startedAt", OffsetDateTime.ofInstant(start, ZoneOffset.UTC));
            change.put("endedAt", ended == null ? null : OffsetDateTime.ofInstant(ended, ZoneOffset.UTC));
            change.put("seconds", Math.max(0, Duration.between(start, end).toSeconds()));
            result.add(change);
        }
        return result;
    }

    static List<Map<String, Object>> mergeSeconds(List<Map<String, Object>> rows, List<Map<String, Object>> pending,
            Integer bucketSec) {
        Map<List<Object>, Map<String, Object>> merged = new LinkedHashMap<>();
        for (Map<String, Object> row : rows) {
            Instant bucket = bucketSec == null ? null : OeeService.toInstant(row.get("bucketStart"));
            merged.put(java.util.Arrays.asList(row.get("equipmentId"), bucket), new HashMap<>(row));
        }
        for (Map<String, Object> p : pending) {
            Instant bucket = bucketSec == null ? null : dateBin(((OffsetDateTime) p.get("bucketStart")).toInstant(), bucketSec);
            Map<String, Object> row = merged.computeIfAbsent(java.util.Arrays.asList(p.get("equipmentId"), bucket), k -> {
                Map<String, Object> fresh = new HashMap<>();
                fresh.put("equipmentId", p.get("equipmentId"));
                if (bucket != null) {
                    fresh.put("bucketStart", bucket.atZone(OeeService.ZONE).toOffsetDateTime());
                }
                return fresh;
            });
            add(row, "plannedSec", (int) p.get("sampleCount"));
            add(row, "runSec", (int) p.get("runSec") + (int) p.get("warnSec"));
            add(row, "downSec", (int) p.get("downSec"));
            add(row, "idleSec", (int) p.get("idleSec"));
        }
        return new ArrayList<>(merged.values());
    }

    /** PostgreSQL date_bin(bucketSec 초, t, 2000-01-01 00:00+09)과 같은 칸 시작 */
    static Instant dateBin(Instant t, int bucketSec) {
        long offset = Duration.between(BUCKET_ORIGIN, t).getSeconds();
        return BUCKET_ORIGIN.plusSeconds(Math.floorDiv(offset, bucketSec) * bucketSec);
    }

    private static void add(Map<String, Object> row, String key, long value) {
        row.put(key, (row.get(key) instanceof Number n ? n.longValue() : 0) + value);
    }

    private static void addStatus(Map<String, long[]> sums, Map<String, Object> row) {
        long[] s = sums.computeIfAbsent((String) row.get("equipmentId"), k -> new long[4]);
        s[0] += ((Number) row.get("runSec")).longValue();
        s[1] += ((Number) row.get("warnSec")).longValue();
        s[2] += ((Number) row.get("downSec")).longValue();
        s[3] += ((Number) row.get("idleSec")).longValue();
    }

    private static Object average(Map<String, Object> row, String metric) {
        int count = (int) row.get(metric + "Count");
        return count == 0 ? null
                : ((java.math.BigDecimal) row.get(metric + "Sum")).divide(java.math.BigDecimal.valueOf(count), 2,
                        java.math.RoundingMode.HALF_UP);
    }

    private static Map<String, Object> point(SensorReading r) {
        Map<String, Object> point = new HashMap<>();
        point.put("recordedAt", OffsetDateTime.ofInstant(r.recordedAt(), ZoneOffset.UTC));
        point.put("status", r.status());
        point.put("temperature", r.temperature());
        point.put("vibration", r.vibration());
        return point;
    }
}
