package com.mmp.auth.controller;

import com.mmp.auth.dto.AuthDtos.*;
import com.mmp.auth.security.CurrentUser;
import com.mmp.auth.service.AuthService;
import com.mmp.auth.service.PasswordResetService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final PasswordResetService passwordResetService;

    public AuthController(AuthService authService, PasswordResetService passwordResetService) {
        this.authService = authService;
        this.passwordResetService = passwordResetService;
    }

    /** US-09 — luôn 202 (không tiết lộ email có tồn tại hay không). */
    @PostMapping("/forgot-password")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void forgotPassword(@Valid @RequestBody ForgotPasswordRequest req) {
        passwordResetService.requestReset(req.email());
    }

    @PostMapping("/reset-password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resetPassword(@Valid @RequestBody ResetPasswordRequest req) {
        passwordResetService.resetPassword(req.token(), req.newPassword());
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@Valid @RequestBody RegisterRequest req) {
        return authService.register(req);
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest req) {
        return authService.login(req);
    }

    @PostMapping("/refresh")
    public AuthResponse refresh(@Valid @RequestBody RefreshRequest req) {
        return authService.refresh(req);
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@Valid @RequestBody RefreshRequest req) {
        authService.logout(req);
    }

    @GetMapping("/verify-email")
    public UserResponse verifyEmail(@RequestParam String token) {
        return authService.verifyEmail(token);
    }

    @PostMapping("/verify-token")
    public VerifyTokenResponse verifyToken(@Valid @RequestBody VerifyTokenRequest req) {
        return authService.verifyToken(req.token());
    }

    @GetMapping("/me")
    public UserResponse me() {
        return authService.me(CurrentUser.get().userId());
    }

    @PutMapping("/me")
    public UserResponse updateMe(@Valid @RequestBody UpdateMeRequest req) {
        return authService.updateMe(CurrentUser.get().userId(), req);
    }

    @PostMapping("/me/change-password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@Valid @RequestBody ChangePasswordRequest req) {
        authService.changePassword(CurrentUser.get().userId(), req);
    }
}
