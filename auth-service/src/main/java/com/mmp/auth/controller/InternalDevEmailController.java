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

    public InternalDevEmailController(LoggingEmailSender emailSender) {
        this.emailSender = emailSender;
    }

    @GetMapping("/internal/dev/emails")
    public List<LoggingEmailSender.SentEmail> emails(@RequestParam String to) {
        return emailSender.sentTo(to);
    }
}
