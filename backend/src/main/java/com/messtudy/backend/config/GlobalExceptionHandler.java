package com.messtudy.backend.config;

import java.util.Map;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.messtudy.backend.service.InvalidPayloadException;

/** 잘못된 요청을 400과 이유 메시지로 응답한다. */
@RestControllerAdvice
public class GlobalExceptionHandler {

    /** 필수 값 누락 · 형식 오류 */
    @ExceptionHandler(InvalidPayloadException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, String> handleInvalidPayload(InvalidPayloadException e) {
        return Map.of("message", e.getMessage());
    }

    /** DB 제약 위반(글자 수 초과, NUMERIC(5,2) 범위 초과 등). 트랜잭션은 이미 롤백됐다. */
    @ExceptionHandler(DataIntegrityViolationException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, String> handleDataIntegrity(DataIntegrityViolationException e) {
        return Map.of("message", "저장할 수 없는 값이 있습니다(길이 · 범위 초과)");
    }
}
