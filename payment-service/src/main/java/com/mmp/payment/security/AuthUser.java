package com.mmp.payment.security;

import java.util.UUID;

/**
 * Người dùng đã xác thực, được giải mã từ JWT access token.
 * role: MENTOR | MENTEE | ADMIN (hoặc INTERNAL cho lời gọi service-to-service).
 */
public record AuthUser(UUID userId, String email, String role, boolean emailVerified) {

    /** Token cũ (trước US-39) không có claim ev — coi như đã xác thực; mọi lời gọi nội bộ cũng vậy. */
    public AuthUser(UUID userId, String email, String role) {
        this(userId, email, role, true);
    }

    /** US-39 (PRD-AUTH-3) — tài khoản chưa xác thực email không được gửi yêu cầu, đặt lịch, thanh toán. */
    public void requireVerifiedEmail() {
        if (!emailVerified) {
            throw new com.mmp.payment.exception.ApiException(org.springframework.http.HttpStatus.FORBIDDEN, "EMAIL_NOT_VERIFIED",
                    "Hãy xác thực email trước khi gửi yêu cầu, đặt lịch hoặc thanh toán");
        }
    }

    public static final String ROLE_INTERNAL = "INTERNAL";

    public boolean isAdmin() {
        return "ADMIN".equals(role);
    }

    public boolean isInternal() {
        return ROLE_INTERNAL.equals(role);
    }

    /** Chính chủ tài nguyên, admin hoặc service nội bộ. */
    public boolean canAccess(UUID ownerId) {
        return isAdmin() || isInternal() || userId != null && userId.equals(ownerId);
    }
}
