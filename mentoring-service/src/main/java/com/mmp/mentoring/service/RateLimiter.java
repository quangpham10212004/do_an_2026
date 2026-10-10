package com.mmp.mentoring.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * US-46 (NFR-10) — giới hạn tần suất cửa sổ cố định, đếm trong bộ nhớ (mentoring-service chạy một instance, không có
 * Redis). Khoá hết hạn được dọn dần khi số khoá lớn để bộ nhớ không phình vô hạn.
 */
@Component
public class RateLimiter {

    private static final int CLEANUP_THRESHOLD = 10_000;

    private final Clock clock;
    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    private record Window(int count, Instant expiresAt) {
    }

    @Autowired
    public RateLimiter() {
        this(Clock.systemUTC());
    }

    RateLimiter(Clock clock) {
        this.clock = clock;
    }

    /** Ghi nhận 1 lần; trả 0 nếu còn trong giới hạn {@code max} / {@code window}, ngược lại số giây phải chờ. */
    public long acquire(String key, int max, Duration window) {
        Instant now = clock.instant();
        if (windows.size() > CLEANUP_THRESHOLD) {
            windows.values().removeIf(w -> !w.expiresAt().isAfter(now));
        }
        Window w = windows.compute(key, (k, c) -> c == null || !c.expiresAt().isAfter(now)
                ? new Window(1, now.plus(window))
                : new Window(c.count() + 1, c.expiresAt()));
        return w.count() <= max ? 0 : Math.max(1, Duration.between(now, w.expiresAt()).toSeconds());
    }
}
