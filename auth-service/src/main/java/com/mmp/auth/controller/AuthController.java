package com.mmp.auth.controller;

import com.mmp.auth.dto.AuthDtos.*;
import com.mmp.auth.security.CurrentUser;
import com.mmp.auth.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
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
