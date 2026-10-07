package com.mmp.auth.service;

import com.mmp.auth.entity.PasswordResetToken;
import com.mmp.auth.entity.User;
import com.mmp.auth.exception.ApiException;
import com.mmp.auth.repository.PasswordResetTokenRepository;
import com.mmp.auth.repository.RefreshTokenRepository;
import com.mmp.auth.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;

/**
 * US-09 (PRD-AUTH-1) — quên mật khẩu.
 *
 * <ul>
 *   <li>Yêu cầu luôn được chấp nhận (202) dù email có tồn tại hay không — không lộ email nào đã đăng ký.</li>
 *   <li>Tối đa {@value #MAX_REQUESTS_PER_HOUR} yêu cầu / email / giờ (Redis); vượt quá thì vẫn 202 nhưng
 *       không tạo token, không gửi email. Bộ đếm tăng cả với email không tồn tại nên không dùng để dò được.</li>
 *   <li>Token: 32 byte ngẫu nhiên, DB lưu SHA-256, hạn 30 phút, dùng một lần; cấp token mới thì token cũ
 *       chưa dùng bị vô hiệu.</li>
 *   <li>Đặt lại thành công: đổi mật khẩu (cùng quy tắc với đăng ký), thu hồi mọi refresh token, xoá bộ đếm
 *       đăng nhập sai.</li>
 * </ul>
 */
@Service
public class PasswordResetService {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);

    static final int MAX_REQUESTS_PER_HOUR = 3;
    static final Duration TOKEN_TTL = Duration.ofMinutes(30);
    static final String RATE_KEY_PREFIX = "auth:pwd-reset:";

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository resetTokenRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailSender emailSender;
    private final RateLimiter rateLimiter;
    private final LoginAttemptService loginAttemptService;
    private final String frontendUrl;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public PasswordResetService(UserRepository userRepository, PasswordResetTokenRepository resetTokenRepository,
                                RefreshTokenRepository refreshTokenRepository, PasswordEncoder passwordEncoder,
                                EmailSender emailSender, RateLimiter rateLimiter, LoginAttemptService loginAttemptService,
                                @Value("${app.frontend-url}") String frontendUrl) {
        this(userRepository, resetTokenRepository, refreshTokenRepository, passwordEncoder, emailSender, rateLimiter,
                loginAttemptService, frontendUrl, Clock.systemDefaultZone());
    }

    PasswordResetService(UserRepository userRepository, PasswordResetTokenRepository resetTokenRepository,
                         RefreshTokenRepository refreshTokenRepository, PasswordEncoder passwordEncoder,
                         EmailSender emailSender, RateLimiter rateLimiter, LoginAttemptService loginAttemptService,
                         String frontendUrl, Clock clock) {
        this.userRepository = userRepository;
        this.resetTokenRepository = resetTokenRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.emailSender = emailSender;
        this.rateLimiter = rateLimiter;
        this.loginAttemptService = loginAttemptService;
        this.frontendUrl = frontendUrl;
        this.clock = clock;
    }

    /** POST /api/auth/forgot-password — không bao giờ ném lỗi nghiệp vụ (luôn 202). */
    @Transactional
    public void requestReset(String rawEmail) {
        String email = rawEmail.trim().toLowerCase();
        if (!rateLimiter.tryAcquire(RATE_KEY_PREFIX + email, MAX_REQUESTS_PER_HOUR, Duration.ofHours(1))) {
            log.info("Password reset rate limit reached for an email; request ignored");
            return;
        }
        User user = userRepository.findByEmailIgnoreCase(email).orElse(null);
        if (user == null || user.getStatus() != User.Status.ACTIVE) {
            return; // không tiết lộ email không tồn tại / bị khoá
        }
        OffsetDateTime now = OffsetDateTime.now(clock);
        resetTokenRepository.invalidateAllForUser(user.getId(), now);
        String token = TokenService.randomToken();
        resetTokenRepository.save(new PasswordResetToken(user.getId(), TokenService.sha256(token), now.plus(TOKEN_TTL)));
        emailSender.send(user.getEmail(), "Đặt lại mật khẩu MentorHub",
                "Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu. Liên kết có hiệu lực trong 30 phút và chỉ dùng được một lần:\n"
                        + frontendUrl + "/reset-password?token=" + token
                        + "\nNếu không phải bạn, hãy bỏ qua email này — mật khẩu hiện tại vẫn giữ nguyên.");
    }

    /** POST /api/auth/reset-password — token sai / hết hạn / đã dùng => 400 RESET_TOKEN_INVALID. */
    @Transactional
    public void resetPassword(String token, String newPassword) {
        OffsetDateTime now = OffsetDateTime.now(clock);
        PasswordResetToken stored = resetTokenRepository.findByTokenHash(TokenService.sha256(token.trim()))
                .orElseThrow(PasswordResetService::invalidToken);
        if (resetTokenRepository.consume(stored.getId(), now) != 1) {
            throw invalidToken();
        }
        User user = userRepository.findById(stored.getUserId()).orElseThrow(PasswordResetService::invalidToken);
        if (user.getStatus() != User.Status.ACTIVE) {
            throw invalidToken();
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        refreshTokenRepository.revokeAllForUser(user.getId());
        loginAttemptService.reset(user.getEmail());
    }

    private static ApiException invalidToken() {
        return ApiException.badRequest("RESET_TOKEN_INVALID",
                "Liên kết đặt lại mật khẩu không hợp lệ, đã hết hạn hoặc đã được sử dụng");
    }
}
