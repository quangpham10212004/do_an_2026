package com.mmp.learning.exception;

/** Format lỗi thống nhất toàn hệ thống: { "error": { "code": "...", "message": "..." } } */
public record ErrorResponse(ErrorBody error) {

    public record ErrorBody(String code, String message) {
    }

    public static ErrorResponse of(String code, String message) {
        return new ErrorResponse(new ErrorBody(code, message));
    }
}
