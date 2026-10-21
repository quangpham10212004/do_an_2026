package com.mmp.mentoring.controller;

import com.mmp.mentoring.service.AccountLockService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * Bản chốt v2.0 §2.1 — auth-service báo tài khoản bị khoá / mở khoá (X-Internal-Token): huỷ buổi chưa diễn ra + hoàn 100% + đóng
 * băng ví (khoá) hoặc mở ví (mở khoá). Idempotent; {@code failed > 0} → bên gọi thử lại.
 */
@RestController
@RequestMapping("/internal/accounts")
public class InternalAccountController {

    public record LockInput(@NotNull Boolean locked, UUID actorId) {
    }

    private final AccountLockService accounts;

    public InternalAccountController(AccountLockService accounts) {
        this.accounts = accounts;
    }

    @PostMapping("/{userId}/lock")
    public AccountLockService.Result lock(@PathVariable UUID userId, @Valid @RequestBody LockInput in) {
        return accounts.onLockChanged(userId, in.locked(), in.actorId());
    }
}
