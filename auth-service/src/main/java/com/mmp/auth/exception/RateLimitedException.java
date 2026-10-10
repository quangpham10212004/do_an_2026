package com.mmp.auth.exception;

import org.springframework.http.HttpStatus;

/** US-46 (NFR-10) — vượt giới hạn tần suất: 429 RATE_LIMITED kèm header Retry-After (giây). */
public class RateLimitedException extends ApiException {

    private final long retryAfterSeconds;

    public RateLimitedException(String message, long retryAfterSeconds) {
        super(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", message);
        this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
    }

    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
