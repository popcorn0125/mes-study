package com.messtudy.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** 실제 파일 · DuckDB로 스풀 → Parquet 변환, 늦게 온 행, 스풀 다시 집계를 확인한다. */
class SensorArchiveTest {

    /** 서울 14:00 = UTC 05:00 */
    private static final Instant HOUR = Instant.parse("2026-10-28T05:00:00Z");

    @TempDir
    Path dir;

    private SensorArchive archive() {
        return new SensorArchive(dir.resolve("spool").toString(), dir.resolve("archive").toString());
    }

    private static SensorReading reading(String equipmentId, int second, String status) {
        return new SensorReading(equipmentId, HOUR.plusSeconds(second), status, second % 2 == 0 ? "WO-1" : null,
                new BigDecimal("60.50"), null, "DOWN".equals(status) ? "CNC_TOOL_BREAK" : null);
    }

    private static long count(String parquetGlob) throws Exception {
        try (Connection duck = DriverManager.getConnection("jdbc:duckdb:"); Statement st = duck.createStatement();
                ResultSet rs = st.executeQuery("SELECT count(*) FROM read_parquet('" + parquetGlob + "')")) {
            rs.next();
            return rs.getLong(1);
        }
    }

    @Test
    void 한_시간이_끝나고_grace가_지나면_스풀을_Parquet으로_바꾸고_지운다() throws Exception {
        SensorArchive archive = archive();
        List<SensorReading> readings = new ArrayList<>();
        for (int s = 0; s < 120; s++) {
            readings.add(reading(s % 3 == 0 ? "LINE,A \"01\"" : "CNC_01", s, s % 10 == 0 ? "DOWN" : "RUN"));
        }
        archive.append(readings);
        Path spool = dir.resolve("spool/sensor-2026-10-28T14.csv");
        assertThat(Files.readAllLines(spool)).hasSize(121).first().isEqualTo(SensorArchive.HEADER);

        Instant hourEnd = HOUR.plus(Duration.ofHours(1));
        assertThat(archive.convertClosed(hourEnd.plusSeconds(119), Duration.ofMinutes(2))).isEmpty();
        List<Path> made = archive.convertClosed(hourEnd.plusSeconds(120), Duration.ofMinutes(2));

        assertThat(made).containsExactly(dir.resolve("archive/date=2026-10-28/hour=14.parquet").toAbsolutePath());
        assertThat(spool).doesNotExist();
        assertThat(count(made.get(0).toString())).isEqualTo(120);
        // 쉼표 · 따옴표가 든 설비 이름도 그대로 읽힌다
        try (Connection duck = DriverManager.getConnection("jdbc:duckdb:"); Statement st = duck.createStatement();
                ResultSet rs = st.executeQuery("SELECT count(*) FROM read_parquet('" + made.get(0)
                        + "') WHERE equipment_id = 'LINE,A \"01\"' AND alarm_code IS NULL = (status <> 'DOWN')")) {
            rs.next();
            assertThat(rs.getLong(1)).isEqualTo(40);
        }
    }

    @Test
    void 바꾼_뒤_늦게_온_행은_late_스풀에_쓰고_다시_집계하면_Parquet과_합친다() throws Exception {
        SensorArchive archive = archive();
        archive.append(List.of(reading("CNC_01", 0, "RUN"), reading("CNC_01", 1, "RUN")));
        archive.convertClosed(HOUR.plus(Duration.ofHours(2)), Duration.ZERO);

        archive.append(List.of(reading("CNC_01", 2, "DOWN"))); // 14:00:02, 이미 Parquet이 있는 시간
        assertThat(archive.spools()).containsValue(LocalDateTime.parse("2026-10-28T14:00"))
                .hasSize(1).allSatisfy((path, hour) -> assertThat(path.getFileName().toString()).endsWith("-late.csv"));

        Map<String, Object> row = archive.reaggregate(LocalDateTime.parse("2026-10-28T14:00")).stream()
                .filter(r -> "WO-1".equals(r.get("workOrderId"))).findFirst().orElseThrow();
        // 14:00 분, 작업지시 WO-1: Parquet의 0초(RUN) + late 스풀의 2초(DOWN)
        assertThat(row).containsEntry("sampleCount", 2).containsEntry("runSec", 1).containsEntry("downSec", 1)
                .containsEntry("lastStatus", "DOWN");

        archive.convertClosed(HOUR.plus(Duration.ofHours(2)), Duration.ZERO);
        assertThat(count(dir.resolve("archive/date=2026-10-28") + "/*.parquet")).isEqualTo(3);
    }

    @Test
    void 남은_스풀에서_설비마다_마지막_10분을_읽는다() {
        SensorArchive archive = archive();
        archive.append(List.of(reading("CNC_01", 0, "RUN"), reading("CNC_01", 900, "RUN"), reading("CNC_01", 1000, "WARN"),
                reading("WINDER_01", 5, "IDLE")));

        List<SensorReading> recent = archive.readRecent(Duration.ofMinutes(10));

        assertThat(recent).extracting(r -> r.equipmentId() + "@" + (r.recordedAt().getEpochSecond() - HOUR.getEpochSecond()))
                .containsExactly("CNC_01@900", "CNC_01@1000", "WINDER_01@5");
        assertThat(recent.get(0).workOrderId()).isEqualTo("WO-1");
        assertThat(recent.get(2).workOrderId()).isNull(); // 빈 칸은 null로 읽는다
    }
}
