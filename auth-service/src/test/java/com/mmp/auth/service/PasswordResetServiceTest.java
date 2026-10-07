package com.mmp.auth.service;

import com.mmp.auth.entity.PasswordResetToken;
import com.mmp.auth.entity.User;
import com.mmp.auth.exception.ApiException;
import com.mmp.auth.repository.PasswordResetTokenRepository;
import com.mmp.auth.repository.RefreshTokenRepository;
import com.mmp.auth.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/** US-09 — quy tắc quên / đặt lại mật khẩu. */
class PasswordResetServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-07T03:00:00Z");
    private static final Pattern LINK = Pattern.compile("/reset-password\\?token=([A-Za-z0-9_-]+)");

    private UserRepository users;
    private PasswordResetTokenRepository resetTokens;
    private RefreshTokenRepository refreshTokens;
    private EmailSender email;
    private PasswordResetService service;
    private final PasswordEncoder encoder = new BCryptPasswordEncoder(4);
    private User user;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        resetTokens = mock(PasswordResetTokenRepository.class);
        refreshTokens = mock(RefreshTokenRepository.class);
        email = mock(EmailSender.class);
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.opsForValue()).thenThrow(new IllegalStateException("redis down")); // bộ đếm trong bộ nhớ
        Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
        LoginAttemptService attempts = new LoginAttemptService(redis, 5, Duration.ofMinutes(15));
        service = new PasswordResetService(users, resetTokens, refreshTokens, encoder, email,
                new RateLimiter(redis, clock), attempts, "http://localhost:3000", clock);

        user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail("a@example.com");
        user.setPasswordHash(encoder.encode("old-password"));
        user.setRole(User.Role.MENTEE);
        when(users.findByEmailIgnoreCase("a@example.com")).thenReturn(Optional.of(user));
        when(users.findById(user.getId())).thenReturn(Optional.of(user));
        when(resetTokens.save(any(PasswordResetToken.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private String requestAndCaptureToken() {
        service.requestReset(" A@Example.com ");
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(email, atLeastOnce()).send(eq("a@example.com"), anyString(), body.capture());
        Matcher m = LINK.matcher(body.getValue());
        assertThat(m.find()).isTrue();
        return m.group(1);
    }

    @Test
    void storesOnlySha256OfA32ByteTokenValidFor30Minutes() {
        String token = requestAndCaptureToken();
        assertThat(java.util.Base64.getUrlDecoder().decode(token)).hasSize(32);
        ArgumentCaptor<PasswordResetToken> saved = ArgumentCaptor.forClass(PasswordResetToken.class);
        verify(resetTokens).save(saved.capture());
        assertThat(saved.getValue().getTokenHash()).isEqualTo(TokenService.sha256(token)).isNotEqualTo(token);
        assertThat(saved.getValue().getExpiresAt()).isEqualTo(OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC).plusMinutes(30));
        verify(resetTokens).invalidateAllForUser(eq(user.getId()), any());
    }

    @Test
    void unknownOrLockedEmailIsSilentlyAccepted() {
        service.requestReset("nobody@example.com");
        user.setStatus(User.Status.LOCKED);
        service.requestReset("a@example.com");
        verifyNoInteractions(email);
        verify(resetTokens, never()).save(any());
    }

    @Test
    void atMostThreeRequestsPerEmailPerHour() {
        for (int i = 0; i < 5; i++) {
            service.requestReset("a@example.com");
        }
        verify(email, times(3)).send(eq("a@example.com"), anyString(), anyString());
        // Email chưa đăng ký cũng bị đếm (không dùng giới hạn để dò email)
        for (int i = 0; i < 4; i++) {
            service.requestReset("ghost@example.com");
        }
        verify(users, times(3)).findByEmailIgnoreCase("ghost@example.com");
    }

    @Test
    void resetChangesPasswordAndRevokesAllSessions() {
        String token = requestAndCaptureToken();
        PasswordResetToken stored = new PasswordResetToken(user.getId(), TokenService.sha256(token),
                OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC).plusMinutes(30));
        when(resetTokens.findByTokenHash(TokenService.sha256(token))).thenReturn(Optional.of(stored));
        when(resetTokens.consume(any(), any())).thenReturn(1);

        service.resetPassword(token, "new-password-123");
        assertThat(encoder.matches("new-password-123", user.getPasswordHash())).isTrue();
        verify(refreshTokens).revokeAllForUser(user.getId());
    }

    @Test
    void unknownExpiredOrUsedTokenIsRejected() {
        assertThatThrownBy(() -> service.resetPassword("does-not-exist", "new-password-123"))
                .extracting(e -> ((ApiException) e).getCode()).isEqualTo("RESET_TOKEN_INVALID");

        PasswordResetToken stored = new PasswordResetToken(user.getId(), TokenService.sha256("t"),
                OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC).minusMinutes(1));
        when(resetTokens.findByTokenHash(TokenService.sha256("t"))).thenReturn(Optional.of(stored));
        when(resetTokens.consume(any(), any())).thenReturn(0); // hết hạn hoặc đã dùng: UPDATE không khớp dòng nào
        assertThatThrownBy(() -> service.resetPassword("t", "new-password-123"))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).getCode()).isEqualTo("RESET_TOKEN_INVALID");
        assertThat(encoder.matches("old-password", user.getPasswordHash())).isTrue();
        verify(refreshTokens, never()).revokeAllForUser(any());
    }

    @Test
    void rateLimiterWindowResetsAfterExpiry() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.opsForValue()).thenThrow(new IllegalStateException("redis down"));
        Instant[] now = {NOW};
        Clock clock = new Clock() {
            public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
            public Clock withZone(java.time.ZoneId zone) { return this; }
            public Instant instant() { return now[0]; }
        };
        RateLimiter limiter = new RateLimiter(redis, clock);
        assertThat(limiter.tryAcquire("k", 1, Duration.ofHours(1))).isTrue();
        assertThat(limiter.tryAcquire("k", 1, Duration.ofHours(1))).isFalse();
        now[0] = NOW.plus(Duration.ofMinutes(61));
        assertThat(limiter.tryAcquire("k", 1, Duration.ofHours(1))).isTrue();
    }
}
