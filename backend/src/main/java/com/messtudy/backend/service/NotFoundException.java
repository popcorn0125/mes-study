package com.messtudy.backend.service;

/** 찾는 대상(작업지시 등)이 없을 때. 404로 응답한다. */
public class NotFoundException extends RuntimeException {

    public NotFoundException(String message) {
        super(message);
    }
}
