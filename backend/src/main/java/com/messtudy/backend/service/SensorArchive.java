package com.messtudy.backend.service;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 1초 원본 보관(docs/plans/sensor-rollup.md 5 · 6장).
 * 받는 동안은 시간마다 스풀 CSV에 이어 쓰고(순차 쓰기), 그 시간이 끝나면 DuckDB로 Parquet(zstd) 한 파일로 바꾼 뒤 스풀을 지운다.
 * 서버가 죽어도 스풀이 남아서, 다시 띄울 때 스풀(+ 같은 시간의 Parquet)로 그 분들의 요약을 다시 만든다.
 *
 * 시간 · 폴더는 서울 기준이다. 파일 쓰기는 이 객체로 synchronized(서버 한 대 전제).
 */
@Component
public class SensorArchive {

    static final String HEADER = "equipment_id,recorded_at,status,work_order_id,temperature,vibration,alarm_code";
    /** DuckDB가 스풀 CSV를 읽을 때의 열 형식 */
    private static final String CSV_COLUMNS = "{'equipment_id':'VARCHAR','recorded_at':'TIMESTAMPTZ','status':'VARCHAR',"
            + "'work_order_id':'VARCHAR','temperature':'DECIMAL(5,2)','vibration':'DECIMAL(5,2)','alarm_code':'VARCHAR'}";
    private static final DateTimeFormatter HOUR = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH");
    /** sensor-2026-10-28T14.csv(그 시간의 스풀) · sensor-2026-10-28T14-late.csv(Parquet으로 바꾼 뒤 늦게 온 행) */
    private static final Pattern SPOOL = Pattern.compile("sensor-(\\d{4}-\\d{2}-\\d{2}T\\d{2})(-late)?\\.csv");

    private final Path spoolDir;
    private final Path archiveDir;
    private final Map<Path, BufferedWriter> writers = new HashMap<>();

    public SensorArchive(@Value("${mes.sensor.spool-dir:data/spool}") String spoolDir,
            @Value("${mes.sensor.archive-dir:data/archive/sensor-log}") String archiveDir) {
        this.spoolDir = Path.of(spoolDir).toAbsolutePath();
        this.archiveDir = Path.of(archiveDir).toAbsolutePath();
    }

    /** 원본을 그 시간의 스풀에 이어 쓰고 OS 버퍼까지 내보낸다(flush, fsync는 하지 않는다: 앱이 죽어도 남고 전원이 나가면 몇 초 잃을 수 있다) */
    public synchronized void append(List<SensorReading> readings) {
        if (readings.isEmpty()) {
            return;
        }
        try {
            Map<Path, BufferedWriter> used = new LinkedHashMap<>();
            for (SensorReading r : readings) {
                Path path = spoolFor(hourOf(r.recordedAt()));
                BufferedWriter writer = used.computeIfAbsent(path, this::writer);
                writer.write(line(r));
                writer.newLine();
            }
            for (BufferedWriter writer : used.values()) {
                writer.flush();
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * 끝난 지 grace가 지난 시간의 스풀을 Parquet으로 바꾸고 지운다.
     *
     * @return 만든 Parquet 파일
     */
    public synchronized List<Path> convertClosed(Instant now, Duration grace) {
        List<Path> made = new ArrayList<>();
        for (Map.Entry<Path, LocalDateTime> spool : spools().entrySet()) {
            Instant hourEnd = spool.getValue().plusHours(1).atZone(OeeService.ZONE).toInstant();
            if (!hourEnd.plus(grace).isAfter(now)) {
                made.add(convert(spool.getKey(), spool.getValue()));
            }
        }
        return made;
    }

    /** 남은 스풀 파일과 그 시간(오래된 것부터) */
    public synchronized Map<Path, LocalDateTime> spools() {
        Map<Path, LocalDateTime> spools = new TreeMap<>();
        if (!Files.isDirectory(spoolDir)) {
            return spools;
        }
        try (Stream<Path> files = Files.list(spoolDir)) {
            files.forEach(path -> {
                Matcher m = SPOOL.matcher(path.getFileName().toString());
                if (m.matches()) {
                    spools.put(path, LocalDateTime.parse(m.group(1), HOUR));
                }
            });
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return spools;
    }

    /**
     * 스풀이 남은 시간의 요약을 다시 만든다. 그 시간의 원본 전부(Parquet + 스풀)를 읽고, 스풀에 들어 있는 분만 집계한다.
     * 스풀에는 그 분의 원본이 다 있으므로(늦게 온 행은 -late 스풀 + 이미 만든 Parquet) 결과를 DB에 덮어써도 된다.
     *
     * @return 요약 행(SensorMinuteMapper 키)
     */
    public synchronized List<Map<String, Object>> reaggregate(LocalDateTime hour) {
        List<String> spoolFiles = spools().entrySet().stream()
                .filter(e -> e.getValue().equals(hour)).map(e -> e.getKey().toString()).toList();
        if (spoolFiles.isEmpty()) {
            return List.of();
        }
        flushWriters();
        String spoolSource = "read_csv(" + list(spoolFiles) + ", header=true, columns=" + CSV_COLUMNS + ")";
        List<String> parquets = parquetsOf(hour);
        String all = parquets.isEmpty() ? spoolSource
                : "(SELECT * FROM read_parquet(" + list(parquets) + ") UNION ALL BY NAME SELECT * FROM " + spoolSource + ")";
        String sql = """
                SELECT equipment_id,
                       (epoch_ms(recorded_at) // 60000) * 60000 AS bucket_ms,
                       COALESCE(work_order_id, '') AS work_order_id,
                       count(*)::INTEGER AS sample_count,
                       COALESCE(sum(temperature), 0)::DECIMAL(12, 2) AS temperature_sum,
                       count(temperature)::INTEGER AS temperature_count,
                       min(temperature) AS temperature_min, max(temperature) AS temperature_max,
                       COALESCE(sum(vibration), 0)::DECIMAL(12, 2) AS vibration_sum,
                       count(vibration)::INTEGER AS vibration_count,
                       min(vibration) AS vibration_min, max(vibration) AS vibration_max,
                       count(*) FILTER (WHERE status = 'RUN')::INTEGER AS run_sec,
                       count(*) FILTER (WHERE status = 'WARN')::INTEGER AS warn_sec,
                       count(*) FILTER (WHERE status = 'DOWN')::INTEGER AS down_sec,
                       count(*) FILTER (WHERE status = 'IDLE')::INTEGER AS idle_sec,
                       arg_max(status, recorded_at) AS last_status,
                       max(epoch_ms(recorded_at)) AS last_ms,
                       arg_max(temperature, recorded_at) AS last_temperature,
                       arg_max(vibration, recorded_at) AS last_vibration
                FROM %s
                WHERE (epoch_ms(recorded_at) // 60000) IN (SELECT DISTINCT epoch_ms(recorded_at) // 60000 FROM %s)
                GROUP BY 1, 2, 3
                """.formatted(all, spoolSource);
        List<Map<String, Object>> rows = new ArrayList<>();
        try (Connection duck = DriverManager.getConnection("jdbc:duckdb:"); Statement st = duck.createStatement();
                ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                Map<String, Object> row = new HashMap<>();
                row.put("equipmentId", rs.getString("equipment_id"));
                row.put("bucketStart", utc(rs.getLong("bucket_ms")));
                row.put("workOrderId", rs.getString("work_order_id"));
                row.put("sampleCount", rs.getInt("sample_count"));
                row.put("temperatureSum", rs.getBigDecimal("temperature_sum"));
                row.put("temperatureCount", rs.getInt("temperature_count"));
                row.put("temperatureMin", rs.getBigDecimal("temperature_min"));
                row.put("temperatureMax", rs.getBigDecimal("temperature_max"));
                row.put("vibrationSum", rs.getBigDecimal("vibration_sum"));
                row.put("vibrationCount", rs.getInt("vibration_count"));
                row.put("vibrationMin", rs.getBigDecimal("vibration_min"));
                row.put("vibrationMax", rs.getBigDecimal("vibration_max"));
                row.put("runSec", rs.getInt("run_sec"));
                row.put("warnSec", rs.getInt("warn_sec"));
                row.put("downSec", rs.getInt("down_sec"));
                row.put("idleSec", rs.getInt("idle_sec"));
                row.put("lastStatus", rs.getString("last_status"));
                row.put("lastRecordedAt", utc(rs.getLong("last_ms")));
                row.put("lastTemperature", rs.getBigDecimal("last_temperature"));
                row.put("lastVibration", rs.getBigDecimal("last_vibration"));
                rows.add(row);
            }
        } catch (SQLException e) {
            throw new IllegalStateException("스풀 다시 집계 실패(" + hour + ")", e);
        }
        return rows;
    }

    /** 남은 스풀에서 설비마다 마지막으로 받은 시각부터 length만큼의 원본(설비 · 시각 순서). 서버를 다시 띄울 때 최근 10분 버퍼를 되살린다 */
    public synchronized List<SensorReading> readRecent(Duration length) {
        List<String> files = spools().keySet().stream().map(Path::toString).toList();
        if (files.isEmpty()) {
            return List.of();
        }
        flushWriters();
        String sql = "SELECT equipment_id, epoch_ms(recorded_at) AS ms, status, work_order_id, temperature, vibration, alarm_code"
                + " FROM read_csv(" + list(files) + ", header=true, columns=" + CSV_COLUMNS + ")"
                + " QUALIFY epoch_ms(recorded_at) >= max(epoch_ms(recorded_at)) OVER (PARTITION BY equipment_id) - " + length.toMillis()
                + " ORDER BY equipment_id, recorded_at";
        List<SensorReading> readings = new ArrayList<>();
        try (Connection duck = DriverManager.getConnection("jdbc:duckdb:"); Statement st = duck.createStatement();
                ResultSet rs = st.executeQuery(sql)) {
            while (rs.next()) {
                readings.add(new SensorReading(rs.getString(1), Instant.ofEpochMilli(rs.getLong(2)), rs.getString(3),
                        rs.getString(4), rs.getBigDecimal(5), rs.getBigDecimal(6), rs.getString(7)));
            }
        } catch (SQLException e) {
            throw new IllegalStateException("스풀 읽기 실패", e);
        }
        return readings;
    }

    /** 열린 스풀을 모두 닫는다(서버 종료). 지금 시간의 스풀은 남겨 두고 다음 시작 때 이어 쓴다 */
    public synchronized void close() {
        flushWriters();
        writers.values().forEach(SensorArchive::closeQuietly);
        writers.clear();
    }

    Path parquetPath(LocalDateTime hour, boolean late) {
        Path dir = archiveDir.resolve("date=" + hour.toLocalDate());
        String name = "hour=%02d%s.parquet".formatted(hour.getHour(), late ? "-late-" + System.currentTimeMillis() : "");
        return dir.resolve(name);
    }

    private Path convert(Path spool, LocalDateTime hour) {
        BufferedWriter writer = writers.remove(spool);
        if (writer != null) {
            closeQuietly(writer);
        }
        boolean late = spool.getFileName().toString().contains("-late");
        Path target = parquetPath(hour, late);
        try {
            Files.createDirectories(target.getParent());
            try (Connection duck = DriverManager.getConnection("jdbc:duckdb:"); Statement st = duck.createStatement()) {
                st.execute("COPY (SELECT * FROM read_csv(" + quote(spool.toString()) + ", header=true, columns=" + CSV_COLUMNS
                        + ") ORDER BY recorded_at, equipment_id) TO " + quote(target.toString())
                        + " (FORMAT parquet, COMPRESSION zstd)");
            }
            Files.delete(spool);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (SQLException e) {
            throw new IllegalStateException("Parquet 변환 실패(" + spool + ")", e);
        }
        return target;
    }

    /** 그 시간의 Parquet이 이미 있으면(바꾼 뒤 늦게 온 행) -late 스풀에 쓴다 */
    private Path spoolFor(LocalDateTime hour) {
        String late = Files.exists(parquetPath(hour, false)) ? "-late" : "";
        return spoolDir.resolve("sensor-" + HOUR.format(hour) + late + ".csv");
    }

    /** 열어 둔 스풀이 지워졌으면(직접 지운 경우) 닫고 새로 연다. 지워진 파일에 계속 쓰면 원본을 잃는다 */
    private BufferedWriter writer(Path path) {
        if (writers.containsKey(path) && !Files.exists(path)) {
            closeQuietly(writers.remove(path));
        }
        return writers.computeIfAbsent(path, p -> {
            try {
                Files.createDirectories(p.getParent());
                boolean fresh = !Files.exists(p);
                BufferedWriter w = Files.newBufferedWriter(p, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
                if (fresh) {
                    w.write(HEADER);
                    w.newLine();
                }
                return w;
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        });
    }

    private List<String> parquetsOf(LocalDateTime hour) {
        Path dir = archiveDir.resolve("date=" + hour.toLocalDate());
        if (!Files.isDirectory(dir)) {
            return List.of();
        }
        String prefix = "hour=%02d".formatted(hour.getHour());
        try (Stream<Path> files = Files.list(dir)) {
            return files.filter(p -> {
                String name = p.getFileName().toString();
                return name.endsWith(".parquet") && (name.equals(prefix + ".parquet") || name.startsWith(prefix + "-late-"));
            }).map(Path::toString).sorted().toList();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private void flushWriters() {
        for (BufferedWriter writer : writers.values()) {
            try {
                writer.flush();
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
    }

    static LocalDateTime hourOf(Instant instant) {
        return LocalDateTime.ofInstant(instant, OeeService.ZONE).truncatedTo(ChronoUnit.HOURS);
    }

    static String line(SensorReading r) {
        return String.join(",", csv(r.equipmentId()), r.recordedAt().toString(), csv(r.status()), csv(r.workOrderId()),
                plain(r.temperature()), plain(r.vibration()), csv(r.alarmCode()));
    }

    /** 쉼표 · 따옴표 · 줄바꿈이 있으면 따옴표로 감싼다. null은 빈 칸(DuckDB가 NULL로 읽는다) */
    private static String csv(String value) {
        if (value == null) {
            return "";
        }
        if (value.contains(",") || value.contains("\"") || value.contains("\n") || value.contains("\r")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }

    private static String plain(BigDecimal value) {
        return value == null ? "" : value.toPlainString();
    }

    private static OffsetDateTime utc(long epochMillis) {
        return OffsetDateTime.ofInstant(Instant.ofEpochMilli(epochMillis), ZoneOffset.UTC);
    }

    private static String list(List<String> paths) {
        return "[" + String.join(", ", paths.stream().map(SensorArchive::quote).toList()) + "]";
    }

    private static String quote(String path) {
        return "'" + path.replace("'", "''") + "'";
    }

    private static void closeQuietly(BufferedWriter writer) {
        try {
            writer.close();
        } catch (IOException ignored) {
            // 닫다가 실패해도 이미 flush한 내용은 파일에 있다
        }
    }
}
