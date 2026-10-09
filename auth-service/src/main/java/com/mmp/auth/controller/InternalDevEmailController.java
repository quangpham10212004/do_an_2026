package com.mmp.auth.controller;

import com.mmp.auth.service.LoggingEmailSender;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Hộp thư giả cho môi trường dev/demo/e2e (không có SMTP): đọc email mà LoggingEmailSender đã ghi.
 * Nằm dưới /internal/** (chỉ X-Internal-Token, không đi qua proxy frontend) và KHÔNG tồn tại ở profile prod.
 */
@RestController
@Profile("!prod")
public class InternalDevEmailController {

    private final LoggingEmailSender emailSender;
    private final com.mmp.auth.service.NotificationEmailService notificationEmails;

    public InternalDevEmailController(LoggingEmailSender emailSender,
                                      com.mmp.auth.service.NotificationEmailService notificationEmails) {
        this.emailSender = emailSender;
        this.notificationEmails = notificationEmails;
    }

    /** US-38 — hàng đợi email thông báo của một người (PENDING / SENT / SKIPPED…), mới nhất trước. */
    @GetMapping("/internal/dev/email-outbox")
    public List<com.mmp.auth.dto.NotificationDtos.OutboxRow> outbox(@RequestParam java.util.UUID userId) {
        return notificationEmails.recent(userId);
    }

    /** US-38 — gửi ngay các email tới hạn (không chờ job 30 giây). */
    @org.springframework.web.bind.annotation.PostMapping("/internal/dev/jobs/email-outbox")
    public java.util.Map<String, Integer> flush() {
        return java.util.Map.of("sent", notificationEmails.flush());
    }

    @GetMapping("/internal/dev/emails")
    public List<LoggingEmailSender.SentEmail> emails(@RequestParam String to) {
        return emailSender.sentTo(to);
    }
}
