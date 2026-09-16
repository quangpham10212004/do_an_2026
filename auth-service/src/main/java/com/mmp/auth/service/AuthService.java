package com.mmp.auth.service;

import com.mmp.auth.client.ReferralClient;
import com.mmp.auth.dto.AuthDtos.*;
import com.mmp.auth.entity.RefreshToken;
import com.mmp.auth.entity.User;
import com.mmp.auth.exception.ApiException;
import com.mmp.auth.repository.RefreshTokenRepository;
import com.mmp.auth.repository.UserRepository;
import com.mmp.auth.security.JwtService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;
    private final JwtService jwtService;
    private final LoginAttemptService loginAttemptService;
    private final EmailSender emailSender;
    private final ReferralClient referralClient;
    private final boolean exposeVerificationToken;
    private final String frontendUrl;

    public AuthService(UserRepository userRepository,
                       RefreshTokenRepository refreshTokenRepository,
                       PasswordEncoder passwordEncoder,
                       TokenService tokenService,
                       JwtService jwtService,
                       LoginAttemptService loginAttemptService,
                       EmailSender emailSender,
                       ReferralClient referralClient,
                       @Value("${app.expose-verification-token}") boolean exposeVerificationToken,
                       @Value("${app.frontend-url}") String frontendUrl) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenService = tokenService;
        this.jwtService = jwtService;
        this.loginAttemptService = loginAttemptService;
        this.emailSender = emailSender;
        this.referralClient = referralClient;
        this.exposeVerificationToken = exposeVerificationToken;
        this.frontendUrl = frontendUrl;
    }

    /** FR-1.1 — Đăng ký tài khoản mentor/mentee. */
    @Transactional
    public AuthResponse register(RegisterRequest req) {
        String email = req.email().trim().toLowerCase();
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw ApiException.conflict("EMAIL_ALREADY_EXISTS", "Email đã được sử dụng");
        }
        User user = new User();
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(req.password()));
        user.setFullName(req.fullName() == null || req.fullName().isBlank() ? null : req.fullName().trim());
        user.setRole(User.Role.valueOf(req.role()));
        String verificationToken = TokenService.randomToken();
        user.setEmailVerificationToken(verificationToken);
        user = userRepository.save(user);

        emailSender.send(email, "Xác thực tài khoản Mentor-Mentee Platform",
                "Bấm vào liên kết để xác thực email: " + frontendUrl + "/verify-email?token=" + verificationToken);

        Boolean referralApplied = null;
        if (req.referralCode() != null && !req.referralCode().isBlank()) {
            referralApplied = referralClient.registerReferral(req.referralCode().trim().toUpperCase(), user.getId());
        }

        TokenService.IssuedTokens tokens = tokenService.issue(user);
        return toResponse(user, tokens, referralApplied, exposeVerificationToken ? verificationToken : null);
    }

    /** FR-1.2 — Đăng nhập bằng email/password. */
    @Transactional
    public AuthResponse login(LoginRequest req) {
        String email = req.email().trim().toLowerCase();
        if (loginAttemptService.isBlocked(email)) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_ATTEMPTS",
                    "Bạn đã nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút");
        }
        User user = userRepository.findByEmailIgnoreCase(email)
                .filter(u -> passwordEncoder.matches(req.password(), u.getPasswordHash()))
                .orElse(null);
        if (user == null) {
            loginAttemptService.recordFailure(email);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng");
        }
        if (user.getStatus() == User.Status.LOCKED) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ACCOUNT_LOCKED", "Tài khoản đã bị khoá, vui lòng liên hệ quản trị viên");
        }
        loginAttemptService.reset(email);
        return toResponse(user, tokenService.issue(user), null, null);
    }

    /** Đổi refresh token lấy cặp token mới (rotation: token cũ bị thu hồi). */
    @Transactional
    public AuthResponse refresh(RefreshRequest req) {
        RefreshToken stored = refreshTokenRepository.findByTokenHash(TokenService.sha256(req.refreshToken()))
                .orElseThrow(() -> ApiException.unauthorized("Refresh token không hợp lệ"));
        if (!stored.isUsable()) {
            if (stored.isRevoked()) {
                // Token đã bị thu hồi nhưng vẫn được dùng lại => có thể bị đánh cắp: thu hồi toàn bộ.
                refreshTokenRepository.revokeAllForUser(stored.getUserId());
            }
            throw ApiException.unauthorized("Refresh token đã hết hạn hoặc bị thu hồi");
        }
        stored.setRevoked(true);
        User user = userRepository.findById(stored.getUserId())
                .orElseThrow(() -> ApiException.unauthorized("Tài khoản không tồn tại"));
        if (user.getStatus() == User.Status.LOCKED) {
            throw new ApiException(HttpStatus.FORBIDDEN, "ACCOUNT_LOCKED", "Tài khoản đã bị khoá");
        }
        return toResponse(user, tokenService.issue(user), null, null);
    }

    @Transactional
    public void logout(RefreshRequest req) {
        refreshTokenRepository.findByTokenHash(TokenService.sha256(req.refreshToken()))
                .ifPresent(t -> t.setRevoked(true));
    }

    @Transactional
    public UserResponse verifyEmail(String token) {
        User user = userRepository.findByEmailVerificationToken(token)
                .orElseThrow(() -> ApiException.badRequest("INVALID_VERIFICATION_TOKEN", "Liên kết xác thực không hợp lệ hoặc đã được sử dụng"));
        user.setEmailVerified(true);
        user.setEmailVerificationToken(null);
        return UserResponse.from(user);
    }

    /** Endpoint nội bộ: xác thực JWT và kiểm tra tài khoản còn hoạt động. */
    @Transactional(readOnly = true)
    public VerifyTokenResponse verifyToken(String token) {
        return jwtService.parse(token)
                .flatMap(authUser -> userRepository.findById(authUser.userId()))
                .filter(u -> u.getStatus() == User.Status.ACTIVE)
                .map(u -> new VerifyTokenResponse(true, u.getId(), u.getRole().name()))
                .orElse(new VerifyTokenResponse(false, null, null));
    }

    @Transactional(readOnly = true)
    public UserResponse me(UUID userId) {
        return UserResponse.from(getUser(userId));
    }

    /** FR-1.4 — cập nhật thông tin cá nhân. */
    @Transactional
    public UserResponse updateMe(UUID userId, UpdateMeRequest req) {
        User user = getUser(userId);
        user.setFullName(req.fullName().trim());
        return UserResponse.from(user);
    }

    /** FR-1.4 — đổi mật khẩu; thu hồi mọi refresh token để đăng xuất các thiết bị khác. */
    @Transactional
    public void changePassword(UUID userId, ChangePasswordRequest req) {
        User user = getUser(userId);
        if (!passwordEncoder.matches(req.currentPassword(), user.getPasswordHash())) {
            throw ApiException.badRequest("WRONG_PASSWORD", "Mật khẩu hiện tại không đúng");
        }
        user.setPasswordHash(passwordEncoder.encode(req.newPassword()));
        refreshTokenRepository.revokeAllForUser(userId);
    }

    private User getUser(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "Không tìm thấy người dùng"));
    }

    private static AuthResponse toResponse(User user, TokenService.IssuedTokens tokens,
                                           Boolean referralApplied, String verificationToken) {
        return new AuthResponse(user.getId(), user.getEmail(), user.getFullName(), user.getRole().name(),
                user.isEmailVerified(), tokens.accessToken(), tokens.refreshToken(), tokens.expiresInSeconds(),
                referralApplied, verificationToken);
    }
}
