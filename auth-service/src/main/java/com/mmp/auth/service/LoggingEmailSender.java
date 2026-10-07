package com.mmp.auth.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

/**
 * EmailSender mặc định (demo không có SMTP): ghi email ra log, đồng thời giữ 100 email gần nhất trong
 * bộ nhớ để kiểm thử e2e đọc được link qua {@code GET /internal/dev/emails} (chỉ bật ngoài profile prod,
 * cần X-Internal-Token — xem InternalDevEmailController).
 */
@Component
public class LoggingEmailSender implements EmailSender {

    private static final Logger log = LoggerFactory.getLogger(LoggingEmailSender.class);
    private static final int OUTBOX_SIZE = 100;

    public record SentEmail(String to, String subject, String body, OffsetDateTime sentAt) {
    }

    private final Deque<SentEmail> outbox = new ArrayDeque<>();

    @Override
    public void send(String to, String subject, String body) {
        log.info("[EMAIL] to={} subject=\"{}\"\n{}", to, subject, body);
        synchronized (outbox) {
            outbox.addFirst(new SentEmail(to, subject, body, OffsetDateTime.now()));
            while (outbox.size() > OUTBOX_SIZE) {
                outbox.removeLast();
            }
        }
    }

    /** Email đã "gửi" tới địa chỉ này, mới nhất trước. */
    public List<SentEmail> sentTo(String to) {
        synchronized (outbox) {
            return outbox.stream().filter(e -> e.to().equalsIgnoreCase(to)).toList();
        }
    }
}
