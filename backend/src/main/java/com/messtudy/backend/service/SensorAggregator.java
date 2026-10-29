package com.messtudy.backend.service;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

/**
 * 서버 메모리에서 센서 원본을 모은다(docs/plans/sensor-rollup.md 4 · 6장).
 * - 1분 요약: 설비 · 분 · 작업지시마다 버킷 하나. 분이 끝나면 꺼내(drainClosed) DB에 합친다
 * - 설비 상태: 마지막으로 받은 시각 · 지금 상태 구간 · 최근 10분 원본(실시간 화면)
 *
 * 같은 설비는 수신 트랜잭션의 설비별 잠금으로 한 번에 하나만 들어온다. 버킷은 ConcurrentHashMap.compute 안에서만 바꾸고,
 * 설비 상태는 그 객체로 synchronized 해서 조회(다른 스레드)와 섞이지 않게 한다. 서버 한 대가 전제다.
 */
@Component
public class SensorAggregator {

    /** 실시간 화면이 보는 최근 원본 길이 */
    static final Duration RECENT = Duration.ofMinutes(10);
    /** 마지막으로 받은 시각에서 이만큼 넘게 끊기면 상태 구간을 나눈다(비가동 추적과 같은 값) */
    static final Duration GAP = SensorLogService.DOWNTIME_GAP;

    /** 1분 요약 한 행의 키. 작업지시가 없으면 "" */
    record Key(String equipmentId, Instant bucketStart, String workOrderId) {
    }

    /**
     * 설비의 상태 구간 추적. 상태가 바뀌거나 GAP을 넘게 끊겼다가 오면 새 구간이다.
     *
     * @param lastSeen 마지막으로 받은 시각
     * @param status   지금 구간의 상태
     * @param since    지금 구간이 시작된 시각
     */
    record Tracker(Instant lastSeen, String status, Instant since) {

        /** reading이 새 구간을 시작하나(처음 받는 설비면 항상) */
        static boolean startsSegment(Tracker tracker, SensorReading reading) {
            return tracker == null || isGap(tracker, reading) || !tracker.status.equals(reading.status());
        }

        /** 새 구간이 시작될 때 지금 구간이 끝나는 시각: 끊겼으면 마지막으로 받은 시각 + 1초, 아니면 새 행의 시각 */
        static Instant endOf(Tracker tracker, SensorReading reading) {
            return isGap(tracker, reading) ? tracker.lastSeen.plusSeconds(1) : reading.recordedAt();
        }

        static Tracker next(Tracker tracker, SensorReading reading) {
            Instant since = startsSegment(tracker, reading) ? reading.recordedAt() : tracker.since;
            return new Tracker(reading.recordedAt(), reading.status(), since);
        }

        private static boolean isGap(Tracker tracker, SensorReading reading) {
            return reading.recordedAt().isAfter(tracker.lastSeen.plus(GAP));
        }
    }

    private final ConcurrentHashMap<Key, Bucket> buckets = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Equipment> equipment = new ConcurrentHashMap<>();

    /** 설비의 지금 상태 추적(처음 받는 설비면 null) */
    public Tracker tracker(String equipmentId) {
        Equipment eq = equipment.get(equipmentId);
        if (eq == null) {
            return null;
        }
        synchronized (eq) {
            return eq.tracker;
        }
    }

    /** 받은 원본(설비마다 시각 순서, 마지막 시각 뒤의 것만)을 요약 버킷 · 설비 상태에 넣는다 */
    public void accept(List<SensorReading> readings) {
        for (SensorReading reading : readings) {
            buckets.compute(keyOf(reading), (key, bucket) -> {
                Bucket b = bucket == null ? new Bucket() : bucket;
                b.add(reading);
                return b;
            });
            Equipment eq = equipment.computeIfAbsent(reading.equipmentId(), id -> new Equipment());
            synchronized (eq) {
                eq.tracker = Tracker.next(eq.tracker, reading);
                eq.recent.addLast(reading);
                Instant cut = reading.recordedAt().minus(RECENT);
                while (!eq.recent.isEmpty() && eq.recent.peekFirst().recordedAt().isBefore(cut)) {
                    eq.recent.pollFirst();
                }
            }
        }
    }

    /**
     * 끝난 지 grace가 지난 분의 버킷을 꺼낸다(메모리에서 지운다).
     *
     * @return 요약 행(SensorMinuteMapper 키)
     */
    public List<Map<String, Object>> drainClosed(Instant now, Duration grace) {
        Instant closedBefore = now.minus(grace).minus(Duration.ofMinutes(1));
        return drain(key -> !key.bucketStart.isAfter(closedBefore));
    }

    /** 모든 버킷을 꺼낸다(서버 종료) */
    public List<Map<String, Object>> drainAll() {
        return drain(key -> true);
    }

    private List<Map<String, Object>> drain(java.util.function.Predicate<Key> closed) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Key key : List.copyOf(buckets.keySet())) {
            if (closed.test(key)) {
                Bucket bucket = buckets.remove(key);
                if (bucket != null) {
                    rows.add(bucket.toRow(key));
                }
            }
        }
        return rows;
    }

    /** DB에 넣지 못한 요약 행을 다시 버킷에 합친다(다음 플러시 때 다시 넣는다) */
    public void putBack(List<Map<String, Object>> rows) {
        for (Map<String, Object> row : rows) {
            Key key = new Key((String) row.get("equipmentId"), ((OffsetDateTime) row.get("bucketStart")).toInstant(),
                    (String) row.get("workOrderId"));
            buckets.compute(key, (k, bucket) -> {
                Bucket b = bucket == null ? new Bucket() : bucket;
                b.merge(row);
                return b;
            });
        }
    }

    /** 아직 DB에 넣지 않은 요약 행의 복사본(조회할 때 DB 값에 더한다) */
    public List<Map<String, Object>> pendingRows() {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Key key : List.copyOf(buckets.keySet())) {
            buckets.computeIfPresent(key, (k, bucket) -> {
                rows.add(bucket.toRow(k));
                return bucket;
            });
        }
        return rows;
    }

    /** 설비마다 마지막으로 받은 원본 */
    public Map<String, SensorReading> latest() {
        Map<String, SensorReading> latest = new HashMap<>();
        equipment.forEach((id, eq) -> {
            synchronized (eq) {
                if (!eq.recent.isEmpty()) {
                    latest.put(id, eq.recent.peekLast());
                }
            }
        });
        return latest;
    }

    /** 설비 하나의 from 이후 원본(시간순). 메모리에는 마지막으로 받은 시각부터 최근 10분만 있다 */
    public List<SensorReading> recent(String equipmentId, Instant from) {
        Equipment eq = equipment.get(equipmentId);
        if (eq == null) {
            return List.of();
        }
        synchronized (eq) {
            return eq.recent.stream().filter(r -> !r.recordedAt().isBefore(from)).toList();
        }
    }

    /**
     * 서버를 다시 띄울 때 스풀로 설비 상태를 되살린다(시간순 원본, 상태 구간 시작은 DB의 진행 중 이력).
     * 그 설비의 메모리 상태는 스풀 내용으로 바꾼다(여러 번 불러도 같다).
     *
     * @param since 진행 중 이력의 시작 시각(없으면 null: 원본만으로 구간을 다시 만든다)
     */
    public void restore(String equipmentId, Collection<SensorReading> readings, String status, Instant since) {
        Equipment eq = equipment.computeIfAbsent(equipmentId, id -> new Equipment());
        synchronized (eq) {
            eq.tracker = null;
            eq.recent.clear();
            for (SensorReading reading : readings) {
                eq.tracker = Tracker.next(eq.tracker, reading);
                eq.recent.addLast(reading);
            }
            if (eq.tracker != null && since != null && Objects.equals(status, eq.tracker.status)
                    && since.isBefore(eq.tracker.since)) {
                eq.tracker = new Tracker(eq.tracker.lastSeen, status, since);
            }
            if (!eq.recent.isEmpty()) {
                Instant cut = eq.recent.peekLast().recordedAt().minus(RECENT);
                eq.recent.removeIf(r -> r.recordedAt().isBefore(cut));
            }
        }
    }

    /** 메모리를 모두 비운다(테스트 · 서버가 죽은 상황 재현) */
    public void clear() {
        buckets.clear();
        equipment.clear();
    }

    static Key keyOf(SensorReading reading) {
        return new Key(reading.equipmentId(), reading.recordedAt().truncatedTo(ChronoUnit.MINUTES),
                reading.workOrderId() == null ? "" : reading.workOrderId());
    }

    private static final class Equipment {
        private Tracker tracker;
        private final ArrayDeque<SensorReading> recent = new ArrayDeque<>();
    }

    /** 1분 요약 한 행을 만드는 중인 값 */
    static final class Bucket {
        private int sampleCount;
        private BigDecimal temperatureSum = BigDecimal.ZERO;
        private int temperatureCount;
        private BigDecimal temperatureMin;
        private BigDecimal temperatureMax;
        private BigDecimal vibrationSum = BigDecimal.ZERO;
        private int vibrationCount;
        private BigDecimal vibrationMin;
        private BigDecimal vibrationMax;
        private int runSec;
        private int warnSec;
        private int downSec;
        private int idleSec;
        private String lastStatus;
        private Instant lastRecordedAt;
        private BigDecimal lastTemperature;
        private BigDecimal lastVibration;

        void add(SensorReading r) {
            sampleCount++;
            if (r.temperature() != null) {
                temperatureSum = temperatureSum.add(r.temperature());
                temperatureCount++;
                temperatureMin = min(temperatureMin, r.temperature());
                temperatureMax = max(temperatureMax, r.temperature());
            }
            if (r.vibration() != null) {
                vibrationSum = vibrationSum.add(r.vibration());
                vibrationCount++;
                vibrationMin = min(vibrationMin, r.vibration());
                vibrationMax = max(vibrationMax, r.vibration());
            }
            switch (r.status()) {
                case "RUN" -> runSec++;
                case "WARN" -> warnSec++;
                case "DOWN" -> downSec++;
                case "IDLE" -> idleSec++;
                default -> { }
            }
            if (lastRecordedAt == null || !r.recordedAt().isBefore(lastRecordedAt)) {
                lastStatus = r.status();
                lastRecordedAt = r.recordedAt();
                lastTemperature = r.temperature();
                lastVibration = r.vibration();
            }
        }

        /** 다른 요약 행(같은 키)을 합친다. DB의 ON CONFLICT 합치기와 같은 규칙 */
        void merge(Map<String, Object> row) {
            sampleCount += (int) row.get("sampleCount");
            temperatureSum = temperatureSum.add((BigDecimal) row.get("temperatureSum"));
            temperatureCount += (int) row.get("temperatureCount");
            temperatureMin = min(temperatureMin, (BigDecimal) row.get("temperatureMin"));
            temperatureMax = max(temperatureMax, (BigDecimal) row.get("temperatureMax"));
            vibrationSum = vibrationSum.add((BigDecimal) row.get("vibrationSum"));
            vibrationCount += (int) row.get("vibrationCount");
            vibrationMin = min(vibrationMin, (BigDecimal) row.get("vibrationMin"));
            vibrationMax = max(vibrationMax, (BigDecimal) row.get("vibrationMax"));
            runSec += (int) row.get("runSec");
            warnSec += (int) row.get("warnSec");
            downSec += (int) row.get("downSec");
            idleSec += (int) row.get("idleSec");
            Instant at = ((OffsetDateTime) row.get("lastRecordedAt")).toInstant();
            if (lastRecordedAt == null || !at.isBefore(lastRecordedAt)) {
                lastStatus = (String) row.get("lastStatus");
                lastRecordedAt = at;
                lastTemperature = (BigDecimal) row.get("lastTemperature");
                lastVibration = (BigDecimal) row.get("lastVibration");
            }
        }

        /** SensorMinuteMapper가 받는 키. 시각은 OffsetDateTime(UTC) */
        Map<String, Object> toRow(Key key) {
            Map<String, Object> row = new HashMap<>();
            row.put("equipmentId", key.equipmentId);
            row.put("bucketStart", OffsetDateTime.ofInstant(key.bucketStart, java.time.ZoneOffset.UTC));
            row.put("workOrderId", key.workOrderId);
            row.put("sampleCount", sampleCount);
            row.put("temperatureSum", temperatureSum);
            row.put("temperatureCount", temperatureCount);
            row.put("temperatureMin", temperatureMin);
            row.put("temperatureMax", temperatureMax);
            row.put("vibrationSum", vibrationSum);
            row.put("vibrationCount", vibrationCount);
            row.put("vibrationMin", vibrationMin);
            row.put("vibrationMax", vibrationMax);
            row.put("runSec", runSec);
            row.put("warnSec", warnSec);
            row.put("downSec", downSec);
            row.put("idleSec", idleSec);
            row.put("lastStatus", lastStatus);
            row.put("lastRecordedAt", OffsetDateTime.ofInstant(lastRecordedAt, java.time.ZoneOffset.UTC));
            row.put("lastTemperature", lastTemperature);
            row.put("lastVibration", lastVibration);
            return row;
        }

        private static BigDecimal min(BigDecimal a, BigDecimal b) {
            return a == null ? b : b == null ? a : a.min(b);
        }

        private static BigDecimal max(BigDecimal a, BigDecimal b) {
            return a == null ? b : b == null ? a : a.max(b);
        }
    }
}
