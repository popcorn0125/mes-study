package com.messtudy.backend.service;

/** 수신 데이터에 필수 값이 없거나 형식이 틀렸을 때. 컨트롤러에서 400으로 응답한다. */
public class InvalidPayloadException extends RuntimeException {

    public InvalidPayloadException(String message) {
        super(message);
    }
}
