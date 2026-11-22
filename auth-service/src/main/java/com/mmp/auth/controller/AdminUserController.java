package com.mmp.auth.controller;

import com.mmp.auth.dto.AuthDtos.*;
import com.mmp.auth.entity.User;
import com.mmp.auth.exception.ApiException;
import com.mmp.auth.repository.UserRepository;
import com.mmp.auth.security.CurrentUser;
import com.mmp.auth.service.AuditService;
import com.mmp.auth.service.EmailVerificationService;
import com.mmp.auth.service.PasswordResetService;
import com.mmp.auth.service.UserAdminService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/auth/admin/users")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserController {

    private final UserAdminService userAdminService;
    private final UserRepository users;
    private final EmailVerificationService verification;
    private final PasswordResetService passwords;
    private final AuditService audit;

    public AdminUserController(UserAdminService userAdminService, UserRepository users,
                               EmailVerificationService verification, PasswordResetService passwords, AuditService audit) {
        this.userAdminService = userAdminService;
        this.users = users;
        this.verification = verification;
        this.passwords = passwords;
        this.audit = audit;
    }

    @GetMapping
    public PageResponse<UserResponse> list(@RequestParam(required = false) String role,
                                           @RequestParam(required = false) String q,
                                           @RequestParam(defaultValue = "0") int page,
                                           @RequestParam(defaultValue = "20") int size) {
        return userAdminService.list(role, q, page, size);
    }

    @GetMapping("/stats")
    public Map<String, Long> stats() {
        return userAdminService.stats();
    }

    @PatchMapping("/{userId}/status")
    public UserResponse updateStatus(@PathVariable UUID userId, @Valid @RequestBody UpdateStatusRequest req) {
        return userAdminService.updateStatus(CurrentUser.get().userId(), userId, req.status(), req.reason());
    }

    public record SuspensionRequest(@NotBlank @Pattern(regexp = "7d|30d|permanent") String duration,
                                    @NotBlank @Size(min = 10, max = 1000) String reason) {}

    @PostMapping("/{userId}/suspension")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void suspend(@PathVariable UUID userId, @Valid @RequestBody SuspensionRequest request) {
        userAdminService.suspend(CurrentUser.get().userId(), userId, request.duration(), request.reason());
    }

    @PostMapping("/{userId}/resend-verification")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resendVerification(@PathVariable UUID userId) {
        verification.resend(userId);
        audit.recordAdmin(CurrentUser.get().userId(), "EMAIL_VERIFICATION_RESENT", "USER", userId.toString(), null, null);
    }

    @PostMapping("/{userId}/reset-password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resetPassword(@PathVariable UUID userId) {
        User user = users.findById(userId)
                .orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "Không tìm thấy người dùng"));
        if (user.getStatus() != User.Status.ACTIVE) {
            throw ApiException.conflict("ACCOUNT_LOCKED", "Tài khoản đang bị khoá");
        }
        if (!passwords.requestReset(user.getEmail())) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "RESET_LIMIT", "Chưa thể gửi lại email đặt lại mật khẩu");
        }
        audit.recordAdmin(CurrentUser.get().userId(), "PASSWORD_RESET_REQUESTED", "USER", userId.toString(), null, null);
    }

    public record UserExtra(String code, String name, OffsetDateTime suspendedUntil) {
        static UserExtra from(User user) {
            String code = "u_" + user.getId().toString().substring(0, 6);
            String name = user.getFullName();
            return new UserExtra(code, name == null || name.isBlank() ? code : name, user.getSuspendedUntil());
        }
    }

    @GetMapping("/extras")
    public Map<UUID, UserExtra> extras(@RequestParam List<UUID> ids) {
        if (ids.size() > 100) throw ApiException.badRequest("TOO_MANY_USERS", "Tối đa 100 người dùng");
        return users.findAllById(ids).stream().collect(Collectors.toMap(User::getId, UserExtra::from));
    }
}
