package com.mmp.learning.security;

import java.util.UUID;

/**
 * Người dùng đã xác thực, được giải mã từ JWT access token.
 * role: MENTOR | MENTEE | ADMIN (hoặc INTERNAL cho lời gọi service-to-service).
 */
public record AuthUser(UUID userId, String email, String role) {

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
