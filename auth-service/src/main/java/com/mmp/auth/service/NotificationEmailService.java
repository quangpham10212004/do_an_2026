package com.mmp.auth.service;

import com.mmp.auth.client.ProfileClient;
import com.mmp.auth.dto.NotificationDtos.*;
import com.mmp.auth.entity.EmailOutbox;
import com.mmp.auth.entity.NotificationPreferences;
import com.mmp.auth.entity.User;
import com.mmp.auth.exception.ApiException;
import com.mmp.auth.repository.EmailOutboxRepository;
import com.mmp.auth.repository.NotificationPreferencesRepository;
import com.mmp.auth.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

/**
 * US-38 (PRD-AUTH-2, PRD-NOTI-1..4) — email thông báo.
 *
 * - mentoring-service / ai-service gửi POST /internal/notifications/email cho các sự kiện có ✉ trong danh mục; auth-service
 *   (nơi có email + tuỳ chọn của người dùng) quyết định gửi ngay, hoãn tới 07:00 (giờ yên tĩnh) hay bỏ qua (nhóm bị tắt),
 *   rồi ghi vào email_outbox.
 * - Job mỗi 30 giây gửi các email tới hạn qua EmailSender (log ở dev, SMTP/Mailpit ở demo): giữ chỗ trong transaction,
 *   gửi NGOÀI transaction, ghi kết quả; lỗi thử lại tối đa 5 lần (cách 5 phút).
 */
@Service
public class NotificationEmailService {

    private static final Logger log = LoggerFactory.getLogger(NotificationEmailService.class);
    static final int BATCH = 50;
    static final int MAX_ATTEMPTS = 5;
    static final Duration RETRY = Duration.ofMinutes(5);
    static final Duration LEASE = Duration.ofMinutes(5);

    private final UserRepository userRepository;
    private final NotificationPreferencesRepository prefsRepo;
    private final EmailOutboxRepository outboxRepo;
    private final ProfileClient profileClient;
    private final EmailSender emailSender;
    private final TransactionTemplate tx;
    private final String frontendUrl;

    public NotificationEmailService(UserRepository userRepository, NotificationPreferencesRepository prefsRepo,
                                    EmailOutboxRepository outboxRepo, ProfileClient profileClient, EmailSender emailSender,
                                    TransactionTemplate tx, @Value("${app.frontend-url}") String frontendUrl) {
        this.userRepository = userRepository;
        this.prefsRepo = prefsRepo;
        this.outboxRepo = outboxRepo;
        this.profileClient = profileClient;
        this.emailSender = emailSender;
        this.tx = tx;
        this.frontendUrl = frontendUrl;
    }

    // ------------------------------------------------------------------ tuỳ chọn

    public PreferencesView preferences(UUID userId) {
        return PreferencesView.from(prefsOf(userId));
    }

    public PreferencesView updatePreferences(UUID userId, PreferencesInput in) {
        NotificationPreferences saved = tx.execute(s -> {
            NotificationPreferences p = prefsOf(userId);
            p.update(in.requests(), in.sessions(), in.messages(), in.reviews(), in.marketing(), in.quietHours(),
                    OffsetDateTime.now());
            return prefsRepo.save(p);
        });
        return PreferencesView.from(saved);
    }

    // ------------------------------------------------------------------ hàng đợi

    public EmailQueued enqueue(EmailRequest in) {
        if (in.dedupeKey() != null && outboxRepo.existsByDedupeKey(in.dedupeKey())) {
            return new EmailQueued(null, "DUPLICATE", null, null);
        }
        User user = userRepository.findById(in.userId())
                .orElseThrow(() -> ApiException.notFound("USER_NOT_FOUND", "Không tìm thấy người nhận"));
        NotificationPreferences prefs = prefsOf(in.userId());
        ZoneId zone = profileClient.timezone(in.userId()); // gọi mạng NGOÀI transaction
        OffsetDateTime now = OffsetDateTime.now();
        String subject = EmailTemplates.notificationSubject(in.type(), in.title());
        String body = EmailTemplates.notificationBody(frontendUrl, user.getFullName(), in.message(), in.link(),
                in.sessionStartAt() == null ? null : in.sessionStartAt().atZoneSameInstant(zone), zone);
        EmailOutbox row = new EmailOutbox(user.getId(), user.getEmail(), in.category().name(), in.type(), subject, body,
                EmailRules.sendAt(now, zone, prefs.isQuietHours(), in.category(), in.type(), in.sessionStartAt()),
                in.dedupeKey(), now);
        if (user.getStatus() == User.Status.LOCKED) {
            row.skip("ACCOUNT_LOCKED");
        } else if (!EmailRules.enabled(prefs, in.category())) {
            row.skip("PREFERENCE_OFF");
        }
        try {
            return EmailQueued.from(tx.execute(s -> outboxRepo.save(row)));
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            return new EmailQueued(null, "DUPLICATE", null, null); // dedupeKey bị ghi đồng thời
        }
    }

    @Scheduled(fixedDelayString = "${app.email.outbox-interval:PT30S}", initialDelayString = "PT20S")
    public void scheduled() {
        flush();
    }

    /** Gửi các email tới hạn; trả số email đã gửi thành công. */
    public int flush() {
        OffsetDateTime now = OffsetDateTime.now();
        List<EmailOutbox> due = tx.execute(s -> {
            List<EmailOutbox> rows = outboxRepo.lockDue(now, BATCH);
            rows.forEach(r -> r.lease(now.plus(LEASE)));
            return outboxRepo.saveAll(rows);
        });
        int sent = 0;
        for (EmailOutbox row : due == null ? List.<EmailOutbox>of() : due) {
            String error = null;
            try {
                emailSender.send(row.getToEmail(), row.getSubject(), row.getBody());
            } catch (RuntimeException e) {
                error = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                log.warn("Email {} to {} failed: {}", row.getType(), row.getUserId(), error);
            }
            String err = error;
            tx.executeWithoutResult(s -> outboxRepo.findById(row.getId()).ifPresent(r -> {
                if (err == null) r.markSent(OffsetDateTime.now());
                else r.markFailed(err, OffsetDateTime.now().plus(RETRY), MAX_ATTEMPTS);
            }));
            if (error == null) sent++;
        }
        return sent;
    }

    public List<OutboxRow> recent(UUID userId) {
        return outboxRepo.findTop50ByUserIdOrderByCreatedAtDesc(userId).stream().map(OutboxRow::from).toList();
    }

    private NotificationPreferences prefsOf(UUID userId) {
        return prefsRepo.findById(userId).orElseGet(() -> NotificationPreferences.defaults(userId));
    }
}
