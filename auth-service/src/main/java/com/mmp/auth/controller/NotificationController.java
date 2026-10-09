package com.mmp.auth.controller;

import com.mmp.auth.dto.NotificationDtos.*;
import com.mmp.auth.security.CurrentUser;
import com.mmp.auth.service.NotificationEmailService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

/** US-38 (PRD-NOTI-1, NOTI-4) — tuỳ chọn email của người dùng + endpoint nội bộ xếp email thông báo vào hàng đợi. */
@RestController
public class NotificationController {

    private final NotificationEmailService emails;

    public NotificationController(NotificationEmailService emails) {
        this.emails = emails;
    }

    @GetMapping("/api/auth/me/notification-preferences")
    public PreferencesView preferences() {
        return emails.preferences(CurrentUser.get().userId());
    }

    @PutMapping("/api/auth/me/notification-preferences")
    public PreferencesView updatePreferences(@Valid @RequestBody PreferencesInput in) {
        return emails.updatePreferences(CurrentUser.get().userId(), in);
    }

    /** Nội bộ (X-Internal-Token) — mentoring-service / ai-service gửi sự kiện có email. */
    @PostMapping("/internal/notifications/email")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public EmailQueued enqueue(@Valid @RequestBody EmailRequest in) {
        return emails.enqueue(in);
    }
}
