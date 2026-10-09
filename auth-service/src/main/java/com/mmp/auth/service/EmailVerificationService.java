package com.mmp.auth.service;

import com.mmp.auth.entity.User;
import com.mmp.auth.exception.ApiException;
import com.mmp.auth.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.util.UUID;

/**
 * US-39 (PRD-AUTH-3) — gửi lại email xác thực từ banner "Tài khoản chưa xác thực": tối đa 3 lần / giờ / tài khoản.
 * Mỗi lần gửi tạo token mới (link cũ hết hiệu lực). Email gửi NGOÀI transaction.
 */
@Service
public class EmailVerificationService {

    public static final int MAX_PER_HOUR = 3;
    static final String RATE_KEY_PREFIX = "resend-verification:";

    private final UserRepository userRepository;
    private final RateLimiter rateLimiter;
    private final EmailSender emailSender;
    private final TransactionTemplate tx;
    private final String frontendUrl;
    private final boolean exposeVerificationToken;

    public EmailVerificationService(UserRepository userRepository, RateLimiter rateLimiter, EmailSender emailSender,
                                    TransactionTemplate tx, @Value("${app.frontend-url}") String frontendUrl,
                                    @Value("${app.expose-verification-token:false}") boolean exposeVerificationToken) {
        this.userRepository = userRepository;
        this.rateLimiter = rateLimiter;
        this.emailSender = emailSender;
        this.tx = tx;
        this.frontendUrl = frontendUrl;
        this.exposeVerificationToken = exposeVerificationToken;
    }

    public record ResendResult(boolean sent, String emailVerificationToken) {
    }

    public ResendResult resend(UUID userId) {
        User current = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "Không tìm thấy tài khoản"));
        if (current.isEmailVerified()) {
            throw ApiException.conflict("EMAIL_ALREADY_VERIFIED", "Email đã được xác thực");
        }
        if (!rateLimiter.tryAcquire(RATE_KEY_PREFIX + userId, MAX_PER_HOUR, Duration.ofHours(1))) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "RESEND_LIMIT",
                    "Bạn đã yêu cầu gửi lại " + MAX_PER_HOUR + " lần trong 1 giờ, vui lòng thử lại sau");
        }
        String token = TokenService.randomToken();
        User user = tx.execute(s -> {
            User u = userRepository.findById(userId).orElseThrow();
            u.setEmailVerificationToken(token);
            return userRepository.save(u);
        });
        emailSender.send(user.getEmail(), EmailTemplates.VERIFY_SUBJECT, EmailTemplates.verifyBody(frontendUrl, token));
        return new ResendResult(true, exposeVerificationToken ? token : null);
    }
}
