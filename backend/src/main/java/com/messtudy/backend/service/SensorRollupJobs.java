package com.messtudy.backend.service;

import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.SmartLifecycle;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 1분 요약 · 원본 아카이브의 정해진 일.
 * - 서버를 띄울 때(웹 서버가 요청을 받기 전): 남은 스풀로 요약 · 최근 10분 복구
 * - 1초마다: 끝난 분의 요약을 DB에 넣는다 / 10초마다: 끝난 시간의 스풀을 Parquet으로 바꾼다
 * - 서버를 끌 때(웹 서버가 멈춘 뒤): 열린 요약을 모두 넣고 스풀을 닫는다
 * 테스트는 mes.sensor.jobs=false로 끄고 SensorRollupService를 직접 부른다.
 */
@Component
@EnableScheduling
@ConditionalOnProperty(name = "mes.sensor.jobs", havingValue = "true", matchIfMissing = true)
public class SensorRollupJobs implements SmartLifecycle {

    private static final Logger log = LoggerFactory.getLogger(SensorRollupJobs.class);

    private final SensorRollupService sensorRollupService;
    private final SensorArchive archive;
    private volatile boolean running;

    public SensorRollupJobs(SensorRollupService sensorRollupService, SensorArchive archive) {
        this.sensorRollupService = sensorRollupService;
        this.archive = archive;
    }

    @Scheduled(fixedDelay = 1000)
    public void flush() {
        if (running) {
            sensorRollupService.flush(Instant.now());
        }
    }

    @Scheduled(fixedDelay = 10_000)
    public void archive() {
        if (running) {
            try {
                sensorRollupService.archive(Instant.now());
            } catch (RuntimeException e) {
                // 스풀은 그대로 남으니 다음에 다시 바꾼다
                log.warn("스풀을 Parquet으로 바꾸지 못했다", e);
            }
        }
    }

    @Override
    public void start() {
        sensorRollupService.recover();
        running = true;
    }

    @Override
    public void stop() {
        running = false;
        int rows = sensorRollupService.flushAll();
        archive.close();
        log.info("센서 요약: 종료하며 열린 요약 {}행을 넣었다", rows);
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    /** 웹 서버(Integer.MAX_VALUE - 1 근처)보다 먼저 시작하고 나중에 멈춘다 */
    @Override
    public int getPhase() {
        return 0;
    }
}
