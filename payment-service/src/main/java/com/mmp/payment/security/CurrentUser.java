package com.mmp.payment.security;

import com.mmp.payment.exception.ApiException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.UUID;

public final class CurrentUser {

    private CurrentUser() {
    }

    public static AuthUser get() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof AuthUser user)) {
            throw ApiException.unauthorized("Bạn cần đăng nhập");
        }
        return user;
    }

    /** Ném 403 nếu người gọi không phải chủ tài nguyên / admin / service nội bộ. */
    public static AuthUser requireAccess(UUID ownerId) {
        AuthUser user = get();
        if (!user.canAccess(ownerId)) {
            throw ApiException.forbidden("Bạn không có quyền thao tác trên tài nguyên của người khác");
        }
        return user;
    }
}
