package com.mmp.mentoring.service;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/** US-46 (NFR-10) — 30 tin / phút / người gửi. */
class RateLimiterTest {

    private final AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-10-10T08:00:00Z"));
    private final RateLimiter limiter = new RateLimiter(new Clock() {
        @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(java.time.ZoneId zone) { return this; }
        @Override public Instant instant() { return now.get(); }
    });

    @Test
    void allowsUpToLimitThenReportsSecondsUntilWindowEnds() {
        for (int i = 0; i < 30; i++) assertThat(limiter.acquire("messages:a", 30, Duration.ofMinutes(1))).isZero();
        now.set(now.get().plusSeconds(20));
        assertThat(limiter.acquire("messages:a", 30, Duration.ofMinutes(1))).isEqualTo(40);
        assertThat(limiter.acquire("messages:b", 30, Duration.ofMinutes(1))).isZero();
    }

    @Test
    void newWindowStartsAfterExpiry() {
        for (int i = 0; i < 31; i++) limiter.acquire("messages:a", 30, Duration.ofMinutes(1));
        now.set(now.get().plusSeconds(61));
        assertThat(limiter.acquire("messages:a", 30, Duration.ofMinutes(1))).isZero();
    }
}
