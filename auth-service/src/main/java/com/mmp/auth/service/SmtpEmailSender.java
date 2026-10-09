package com.mmp.auth.service;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Primary;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

/**
 * US-38 (PRD-AUTH-2) — gửi email thật qua SMTP khi {@code app.email.mode=smtp} (demo: container Mailpit, xem
 * docker-compose profile "mail"). Vẫn ghi vào hộp thư giả của LoggingEmailSender để e2e đọc được link.
 */
@Component
@Primary
@ConditionalOnProperty(name = "app.email.mode", havingValue = "smtp")
public class SmtpEmailSender implements EmailSender {

    private final JavaMailSender mailSender;
    private final LoggingEmailSender log;
    private final String from;

    public SmtpEmailSender(JavaMailSender mailSender, LoggingEmailSender log,
                           @org.springframework.beans.factory.annotation.Value("${app.email.from:MentorHub <no-reply@mentorhub.local>}") String from) {
        this.mailSender = mailSender;
        this.log = log;
        this.from = from;
    }

    @Override
    public void send(String to, String subject, String body) {
        SimpleMailMessage msg = new SimpleMailMessage();
        msg.setFrom(from);
        msg.setTo(to);
        msg.setSubject(subject);
        msg.setText(body);
        mailSender.send(msg);
        log.send(to, subject, body);
    }
}
