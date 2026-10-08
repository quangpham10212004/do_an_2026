package com.mmp.auth.service;

import com.mmp.auth.dto.AuthDtos.PageResponse;
import com.mmp.auth.dto.AuthDtos.UserResponse;
import com.mmp.auth.entity.User;
import com.mmp.auth.exception.ApiException;
import com.mmp.auth.repository.RefreshTokenRepository;
import com.mmp.auth.repository.UserRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/** FR-1.5 — Admin xem, khoá/mở khoá tài khoản. */
@Service
public class UserAdminService {

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final AuditService auditService;

    public UserAdminService(UserRepository userRepository, RefreshTokenRepository refreshTokenRepository,
                            AuditService auditService) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.auditService = auditService;
    }

    @Transactional(readOnly = true)
    public PageResponse<UserResponse> list(String role, String q, int page, int size) {
        User.Role roleFilter = role == null || role.isBlank() ? null : User.Role.valueOf(role.toUpperCase());
        String query = q == null || q.isBlank() ? null : q.trim();
        Page<User> result = userRepository.search(roleFilter, query, PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 100)));
        return new PageResponse<>(result.map(UserResponse::from).getContent(), result.getNumber(), result.getSize(),
                result.getTotalElements(), result.getTotalPages());
    }

    @Transactional
    public UserResponse updateStatus(UUID actingAdminId, UUID userId, String status) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "Không tìm thấy người dùng"));
        User.Status newStatus = User.Status.valueOf(status);
        if (newStatus == User.Status.LOCKED) {
            if (user.getId().equals(actingAdminId)) {
                throw ApiException.badRequest("CANNOT_LOCK_SELF", "Không thể tự khoá tài khoản của chính mình");
            }
            if (user.getRole() == User.Role.ADMIN) {
                throw ApiException.badRequest("CANNOT_LOCK_ADMIN", "Không thể khoá tài khoản quản trị viên");
            }
            refreshTokenRepository.revokeAllForUser(user.getId());
        }
        User.Status oldStatus = user.getStatus();
        user.setStatus(newStatus);
        if (oldStatus != newStatus) {
            // US-30: ghi cùng transaction với thay đổi trạng thái — khoá/mở khoá luôn có dòng nhật ký.
            auditService.recordAdmin(actingAdminId, newStatus == User.Status.LOCKED ? "USER_LOCKED" : "USER_UNLOCKED",
                    "USER", user.getId().toString(),
                    java.util.Map.of("status", oldStatus.name(), "email", user.getEmail()),
                    java.util.Map.of("status", newStatus.name(), "email", user.getEmail()));
        }
        return UserResponse.from(user);
    }

    @Transactional(readOnly = true)
    public java.util.Map<String, Long> stats() {
        return java.util.Map.of(
                "total", userRepository.count(),
                "mentors", userRepository.search(User.Role.MENTOR, null, PageRequest.of(0, 1)).getTotalElements(),
                "mentees", userRepository.search(User.Role.MENTEE, null, PageRequest.of(0, 1)).getTotalElements());
    }
}
