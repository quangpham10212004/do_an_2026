package com.mmp.auth.service;

import com.mmp.auth.client.ReferralClient;
import com.mmp.auth.dto.AuthDtos.*;
import com.mmp.auth.entity.RefreshToken;
import com.mmp.auth.entity.User;
import com.mmp.auth.exception.ApiException;
import com.mmp.auth.repository.RefreshTokenRepository;
import com.mmp.auth.repository.UserRepository;
import com.mmp.auth.security.AuthUser;
import com.mmp.auth.security.JwtService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class AuthServiceTest {

    private static final String SECRET = "test-secret-test-secret-test-secret-test-secret-0123456789";

    private UserRepository users;
    private RefreshTokenRepository tokens;
    private ReferralClient referralClient;
    private JwtService jwt;
    private LoginAttemptService attempts;
    private AuthService service;
    private final PasswordEncoder encoder = new BCryptPasswordEncoder(4);

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        tokens = mock(RefreshTokenRepository.class);
        referralClient = mock(ReferralClient.class);
        jwt = new JwtService(SECRET);
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.opsForValue()).thenThrow(new IllegalStateException("redis down")); // dùng bộ đếm trong bộ nhớ
        attempts = new LoginAttemptService(redis, 3, Duration.ofMinutes(15));
        TokenService tokenService = new TokenService(jwt, tokens, Duration.ofMinutes(30), Duration.ofDays(7));
        service = new AuthService(users, tokens, encoder, tokenService, jwt, attempts, mock(EmailSender.class),
                referralClient, true, "http://localhost:3000");
        when(users.save(any(User.class))).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            if (u.getId() == null) u.setId(UUID.randomUUID());
            return u;
        });
        when(tokens.save(any(RefreshToken.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private User existing(String email, String password, User.Status status) {
        User u = new User();
        u.setId(UUID.randomUUID());
        u.setEmail(email);
        u.setPasswordHash(encoder.encode(password));
        u.setRole(User.Role.MENTEE);
        u.setStatus(status);
        when(users.findByEmailIgnoreCase(email)).thenReturn(Optional.of(u));
        when(users.findById(u.getId())).thenReturn(Optional.of(u));
        return u;
    }

    @Test
    void registerHashesPasswordAndIssuesValidAccessToken() {
        when(referralClient.registerReferral("ABCD2345", null)).thenReturn(true);
        AuthResponse res = service.register(new RegisterRequest("New@Example.com", "secret123", "MENTOR", "An", null));
        assertThat(res.email()).isEqualTo("new@example.com");
        assertThat(res.role()).isEqualTo("MENTOR");
        assertThat(res.refreshToken()).isNotBlank();
        assertThat(res.emailVerificationToken()).isNotBlank();
        AuthUser parsed = jwt.parse(res.accessToken()).orElseThrow();
        assertThat(parsed.userId()).isEqualTo(res.userId());
        assertThat(parsed.role()).isEqualTo("MENTOR");
        verify(users).save(argThat(u -> !u.getPasswordHash().equals("secret123") && encoder.matches("secret123", u.getPasswordHash())));
        verifyNoInteractions(referralClient);
    }

    @Test
    void accessTokenIsSignedWithHs256ForCrossLanguageVerification() {
        AuthResponse res = service.register(new RegisterRequest("alg@example.com", "secret123", "MENTEE", null, null));
        String header = new String(java.util.Base64.getUrlDecoder().decode(res.accessToken().split("\\.")[0]));
        assertThat(header).contains("\"alg\":\"HS256\"");
    }

    @Test
    void registerWithReferralCodeCallsPaymentService() {
        when(referralClient.registerReferral(anyString(), any())).thenReturn(true);
        AuthResponse res = service.register(new RegisterRequest("a@b.com", "secret123", "MENTEE", null, " abcd2345 "));
        assertThat(res.referralApplied()).isTrue();
        verify(referralClient).registerReferral("ABCD2345", res.userId());
    }

    @Test
    void registerRejectsDuplicateEmail() {
        when(users.existsByEmailIgnoreCase("dup@example.com")).thenReturn(true);
        assertThatThrownBy(() -> service.register(new RegisterRequest("dup@example.com", "secret123", "MENTEE", null, null)))
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).getCode()).isEqualTo("EMAIL_ALREADY_EXISTS");
    }

    @Test
    void loginWithWrongPasswordFailsAndBlocksAfterMaxAttempts() {
        existing("u@example.com", "correct-pass", User.Status.ACTIVE);
        for (int i = 0; i < 3; i++) {
            assertThatThrownBy(() -> service.login(new LoginRequest("u@example.com", "wrong")))
                    .extracting(e -> ((ApiException) e).getCode()).isEqualTo("INVALID_CREDENTIALS");
        }
        // Dù mật khẩu đúng, email đang bị chặn tạm thời
        assertThatThrownBy(() -> service.login(new LoginRequest("u@example.com", "correct-pass")))
                .extracting(e -> ((ApiException) e).getCode()).isEqualTo("TOO_MANY_ATTEMPTS");
    }

    @Test
    void lockedAccountCannotLogin() {
        existing("locked@example.com", "correct-pass", User.Status.LOCKED);
        assertThatThrownBy(() -> service.login(new LoginRequest("locked@example.com", "correct-pass")))
                .extracting(e -> ((ApiException) e).getCode()).isEqualTo("ACCOUNT_LOCKED");
    }

    @Test
    void refreshRotatesTokenAndDetectsReuse() {
        User u = existing("r@example.com", "correct-pass", User.Status.ACTIVE);
        AuthResponse login = service.login(new LoginRequest("r@example.com", "correct-pass"));
        RefreshToken stored = new RefreshToken(u.getId(), TokenService.sha256(login.refreshToken()), OffsetDateTime.now().plusDays(1));
        when(tokens.findByTokenHash(TokenService.sha256(login.refreshToken()))).thenReturn(Optional.of(stored));

        AuthResponse refreshed = service.refresh(new RefreshRequest(login.refreshToken()));
        assertThat(refreshed.refreshToken()).isNotEqualTo(login.refreshToken());
        assertThat(stored.isRevoked()).isTrue();

        assertThatThrownBy(() -> service.refresh(new RefreshRequest(login.refreshToken())))
                .isInstanceOf(ApiException.class);
        verify(tokens).revokeAllForUser(u.getId());
    }

    @Test
    void verifyTokenRejectsLockedUsersAndGarbage() {
        User u = existing("v@example.com", "correct-pass", User.Status.ACTIVE);
        String token = service.login(new LoginRequest("v@example.com", "correct-pass")).accessToken();
        assertThat(service.verifyToken(token).valid()).isTrue();
        u.setStatus(User.Status.LOCKED);
        assertThat(service.verifyToken(token).valid()).isFalse();
        assertThat(service.verifyToken("not-a-jwt").valid()).isFalse();
    }

    @Test
    void changePasswordRequiresCurrentPasswordAndRevokesSessions() {
        User u = existing("c@example.com", "old-password", User.Status.ACTIVE);
        assertThatThrownBy(() -> service.changePassword(u.getId(), new ChangePasswordRequest("wrong", "new-password")))
                .extracting(e -> ((ApiException) e).getCode()).isEqualTo("WRONG_PASSWORD");
        service.changePassword(u.getId(), new ChangePasswordRequest("old-password", "new-password"));
        assertThat(encoder.matches("new-password", u.getPasswordHash())).isTrue();
        verify(tokens).revokeAllForUser(u.getId());
    }
}
