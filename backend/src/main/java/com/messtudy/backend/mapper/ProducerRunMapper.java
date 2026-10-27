package com.messtudy.backend.mapper;

import org.apache.ibatis.annotations.Mapper;

/** 시뮬레이터 실행(producer_run). 마지막에 시작한 실행 하나만 활성이다. */
@Mapper
public interface ProducerRunMapper {

    /** 새 실행(UUID 문자열)을 활성으로 만든다(이전 실행은 밀려난다) */
    void activate(String runId);

    /** 활성 실행 ID. 한 번도 시작한 적 없으면 null */
    String findActiveRunId();
}
