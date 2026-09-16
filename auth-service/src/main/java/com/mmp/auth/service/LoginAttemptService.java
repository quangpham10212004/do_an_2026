package com.mmp.auth.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Chống brute-force đăng nhập (NFR-2): sau N lần sai mật khẩu liên tiếp, email bị
 * chặn đăng nhập trong một khoảng thời gian. Bộ đếm lưu ở Redis (dùng chung giữa
 * nhiều instance); nếu Redis không khả dụng thì tự động dùng bộ nhớ trong.
 */
@Service
public class LoginAttemptService {

    private static final Logger log = LoggerFactory.getLogger(LoginAttemptService.class);
    private static final String PREFIX = "auth:login-fail:";

    private final StringRedisTemplate redis;
    private final int maxAttempts;
    private final Duration blockDuration;
    private final Map<String, Counter> localCounters = new ConcurrentHashMap<>();

    private record Counter(int count, Instant expiresAt) {
    }

    public LoginAttemptService(StringRedisTemplate redis,
                               @Value("${app.login-protection.max-failed-attempts}") int maxAttempts,
                               @Value("${app.login-protection.block-duration}") Duration blockDuration) {
        this.redis = redis;
        this.maxAttempts = maxAttempts;
        this.blockDuration = blockDuration;
    }

    public boolean isBlocked(String email) {
        return currentCount(key(email)) >= maxAttempts;
    }

    public void recordFailure(String email) {
        String key = key(email);
        try {
            Long count = redis.opsForValue().increment(key);
            if (count != null && count == 1) {
                redis.expire(key, blockDuration);
            }
        } catch (Exception e) {
            log.debug("Redis unavailable, using in-memory login counter: {}", e.getMessage());
            localCounters.compute(key, (k, c) -> c == null || c.expiresAt().isBefore(Instant.now())
                    ? new Counter(1, Instant.now().plus(blockDuration))
                    : new Counter(c.count() + 1, c.expiresAt()));
        }
    }

    public void reset(String email) {
        String key = key(email);
        localCounters.remove(key);
        try {
            redis.delete(key);
        } catch (Exception ignored) {
            // Redis không khả dụng — bộ đếm trong bộ nhớ đã được xoá ở trên
        }
    }

    private int currentCount(String key) {
        try {
            String value = redis.opsForValue().get(key);
            return value == null ? 0 : Integer.parseInt(value);
        } catch (Exception e) {
            Counter c = localCounters.get(key);
            return c == null || c.expiresAt().isBefore(Instant.now()) ? 0 : c.count();
        }
    }

    private static String key(String email) {
        return PREFIX + email.toLowerCase();
    }
}
