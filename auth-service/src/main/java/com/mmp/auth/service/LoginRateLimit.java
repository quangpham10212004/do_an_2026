package com.mmp.auth.service;

import com.mmp.auth.exception.RateLimitedException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;

/**
 * US-46 (NFR-10) — tối đa N lần gọi POST /api/auth/login mỗi phút trên một địa chỉ IP (mặc định 5), đếm cả lần đúng lẫn
 * sai mật khẩu; bổ sung cho khoá theo tài khoản (5 lần sai → khoá 15 phút) của LoginAttemptService.
 * IP = phần tử đầu của X-Forwarded-For khi tin proxy (frontend BFF đặt header này), ngược lại địa chỉ kết nối.
 */
@Service
public class LoginRateLimit {

    static final Duration WINDOW = Duration.ofMinutes(1);

    private final RateLimiter limiter;
    private final int perMinute;
    private final boolean trustForwardedFor;

    public LoginRateLimit(RateLimiter limiter,
                          @Value("${app.rate-limit.login-per-minute:5}") int perMinute,
                          @Value("${app.rate-limit.trust-forwarded-for:true}") boolean trustForwardedFor) {
        this.limiter = limiter;
        this.perMinute = perMinute;
        this.trustForwardedFor = trustForwardedFor;
    }

    public void check(HttpServletRequest request) {
        if (!limiter.tryAcquire("rl:login:ip:" + clientIp(request, trustForwardedFor), perMinute, WINDOW)) {
            throw new RateLimitedException("Quá nhiều lần đăng nhập từ địa chỉ này. Vui lòng thử lại sau 1 phút.",
                    WINDOW.toSeconds());
        }
    }

    static String clientIp(HttpServletRequest request, boolean trustForwardedFor) {
        String forwarded = trustForwardedFor ? request.getHeader("X-Forwarded-For") : null;
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].strip();
        }
        return request.getRemoteAddr();
    }
}
