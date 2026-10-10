package com.mmp.auth.service;

import com.mmp.auth.exception.RateLimitedException;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** US-46 (NFR-10) — 5 lần đăng nhập / phút / IP. Redis giả lỗi => bộ đếm trong bộ nhớ. */
class LoginRateLimitTest {

    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private final LoginRateLimit limit;

    LoginRateLimitTest() {
        when(redis.opsForValue()).thenThrow(new IllegalStateException("redis down"));
        limit = new LoginRateLimit(new RateLimiter(redis), 5, true);
    }

    private static MockHttpServletRequest from(String forwardedFor, String remote) {
        MockHttpServletRequest r = new MockHttpServletRequest("POST", "/api/auth/login");
        if (forwardedFor != null) r.addHeader("X-Forwarded-For", forwardedFor);
        r.setRemoteAddr(remote);
        return r;
    }

    @Test
    void sixthLoginFromSameIpWithinAMinuteIs429() {
        for (int i = 0; i < 5; i++) limit.check(from("203.0.113.7", "172.18.0.1"));
        assertThatThrownBy(() -> limit.check(from("203.0.113.7, 10.0.0.1", "172.18.0.1")))
                .isInstanceOfSatisfying(RateLimitedException.class, e -> {
                    assertThat(e.getCode()).isEqualTo("RATE_LIMITED");
                    assertThat(e.getRetryAfterSeconds()).isEqualTo(60);
                });
        limit.check(from("203.0.113.8", "172.18.0.1")); // IP khác không bị ảnh hưởng
    }

    @Test
    void clientIpUsesFirstForwardedAddressOnlyWhenTrusted() {
        assertThat(LoginRateLimit.clientIp(from(" 198.51.100.1 , 10.0.0.2", "172.18.0.1"), true)).isEqualTo("198.51.100.1");
        assertThat(LoginRateLimit.clientIp(from("198.51.100.1", "172.18.0.1"), false)).isEqualTo("172.18.0.1");
        assertThat(LoginRateLimit.clientIp(from(null, "172.18.0.1"), true)).isEqualTo("172.18.0.1");
    }
}
