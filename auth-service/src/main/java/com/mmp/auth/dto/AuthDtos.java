package com.mmp.auth.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.mmp.auth.entity.User;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class AuthDtos {

    private AuthDtos() {
    }

    public record RegisterRequest(
            @NotBlank @Email String email,
            @NotBlank @Size(min = 8, max = 72, message = "mật khẩu phải có 8-72 ký tự") String password,
            @NotNull @Pattern(regexp = "MENTOR|MENTEE", message = "chỉ được chọn MENTOR hoặc MENTEE") String role,
            @Size(max = 100) String fullName,
            @Size(max = 32) String referralCode) {
    }

    public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {
    }

    public record RefreshRequest(@NotBlank String refreshToken) {
    }

    public record VerifyTokenRequest(@NotBlank String token) {
    }

    public record VerifyTokenResponse(boolean valid, UUID userId, String role) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AuthResponse(
            UUID userId,
            String email,
            String fullName,
            String role,
            boolean emailVerified,
            String accessToken,
            String refreshToken,
            long expiresIn,
            Boolean referralApplied,
            String emailVerificationToken) {
    }

    public record UpdateMeRequest(@NotBlank @Size(max = 100) String fullName) {
    }

    public record ChangePasswordRequest(
            @NotBlank String currentPassword,
            @NotBlank @Size(min = 8, max = 72, message = "mật khẩu mới phải có 8-72 ký tự") String newPassword) {
    }

    public record UserResponse(
            UUID id,
            String email,
            String fullName,
            String role,
            String status,
            boolean emailVerified,
            OffsetDateTime createdAt) {

        public static UserResponse from(User u) {
            return new UserResponse(u.getId(), u.getEmail(), u.getFullName(), u.getRole().name(),
                    u.getStatus().name(), u.isEmailVerified(), u.getCreatedAt());
        }
    }

    public record PageResponse<T>(List<T> items, int page, int size, long totalItems, int totalPages) {
    }

    public record UpdateStatusRequest(@NotNull @Pattern(regexp = "ACTIVE|LOCKED") String status) {
    }
}
