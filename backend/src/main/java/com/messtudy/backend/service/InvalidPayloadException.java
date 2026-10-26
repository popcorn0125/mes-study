package com.messtudy.backend.service;

/** 수신 데이터에 필수 값이 없거나 형식이 틀렸을 때, 조회 조건(기간 등)이 허용 범위 밖일 때. 400으로 응답한다. */
public class InvalidPayloadException extends RuntimeException {

    public InvalidPayloadException(String message) {
        super(message);
    }
}
