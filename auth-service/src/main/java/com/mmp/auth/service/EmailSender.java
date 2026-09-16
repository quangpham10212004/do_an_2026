package com.mmp.auth.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Gửi email. Phạm vi đồ án không tích hợp SMTP thật nên nội dung email được ghi
 * ra log; có thể thay bằng implementation dùng JavaMailSender khi triển khai.
 */
@Component
public class EmailSender {

    private static final Logger log = LoggerFactory.getLogger(EmailSender.class);

    public void send(String to, String subject, String body) {
        log.info("[EMAIL] to={} subject=\"{}\"\n{}", to, subject, body);
    }
}
