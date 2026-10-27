package com.messtudy.backend.service;

/** 지금 상태에서 할 수 없는 요청(완료된 작업지시 보류, 밀려난 시뮬레이터의 전송 등). 409로 응답한다. */
public class StateConflictException extends RuntimeException {

    public StateConflictException(String message) {
        super(message);
    }
}
