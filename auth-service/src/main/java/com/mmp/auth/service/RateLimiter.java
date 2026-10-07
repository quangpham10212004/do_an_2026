package com.mmp.auth.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Giới hạn số lần thực hiện một thao tác trong cửa sổ cố định (fixed window): Redis INCR + EXPIRE,
 * dùng chung giữa nhiều instance; Redis lỗi thì tự dùng bộ đếm trong bộ nhớ (giống LoginAttemptService).
 */
@Service
public class RateLimiter {

    private static final Logger log = LoggerFactory.getLogger(RateLimiter.class);

    private final StringRedisTemplate redis;
    private final Clock clock;
    private final Map<String, Window> local = new ConcurrentHashMap<>();

    private record Window(int count, Instant expiresAt) {
    }

    @org.springframework.beans.factory.annotation.Autowired
    public RateLimiter(StringRedisTemplate redis) {
        this(redis, Clock.systemUTC());
    }

    RateLimiter(StringRedisTemplate redis, Clock clock) {
        this.redis = redis;
        this.clock = clock;
    }

    /** Ghi nhận 1 lần thực hiện; true nếu vẫn trong giới hạn {@code max} lần / {@code window}. */
    public boolean tryAcquire(String key, int max, Duration window) {
        try {
            Long count = redis.opsForValue().increment(key);
            if (count != null && count == 1) {
                redis.expire(key, window);
            }
            return count != null && count <= max;
        } catch (Exception e) {
            log.debug("Redis unavailable, using in-memory rate limiter: {}", e.getMessage());
            Instant now = clock.instant();
            Window w = local.compute(key, (k, c) -> c == null || !c.expiresAt().isAfter(now)
                    ? new Window(1, now.plus(window))
                    : new Window(c.count() + 1, c.expiresAt()));
            return w.count() <= max;
        }
    }
}
