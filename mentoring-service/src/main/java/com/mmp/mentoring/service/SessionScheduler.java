package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.repository.SessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * Tác vụ nền mỗi phút:
 * - FR-5.5: gửi nhắc lịch cho phiên CONFIRMED sắp diễn ra.
 * - Huỷ phiên PENDING quá hạn thanh toán để giải phóng khung giờ.
 * - Tự hoàn thành phiên CONFIRMED đã kết thúc quá 2 giờ (nếu mentor quên đánh dấu).
 */
@Component
public class SessionScheduler {

    private static final Logger log = LoggerFactory.getLogger(SessionScheduler.class);
    private static final DateTimeFormatter DISPLAY = DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy");

    private final SessionRepository sessionRepo;
    private final NotificationService notifications;
    private final Duration reminderBefore;
    private final Duration paymentHold;
    private final ZoneId zone;

    public SessionScheduler(SessionRepository sessionRepo, NotificationService notifications,
                            @Value("${app.reminder.before}") Duration reminderBefore,
                            @Value("${app.booking.payment-hold}") Duration paymentHold,
                            @Value("${app.timezone}") String timezone) {
        this.sessionRepo = sessionRepo;
        this.notifications = notifications;
        this.reminderBefore = reminderBefore;
        this.paymentHold = paymentHold;
        this.zone = ZoneId.of(timezone);
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 20_000)
    @Transactional
    public void sendReminders() {
        OffsetDateTime now = OffsetDateTime.now();
        for (MentoringSession s : sessionRepo.findNeedingReminder(now, now.plus(reminderBefore))) {
            String when = s.getScheduledAt().atZoneSameInstant(zone).format(DISPLAY);
            String msg = "Bạn có phiên mentoring lúc " + when + (s.getTopic() == null ? "" : " — chủ đề: " + s.getTopic()) + ".";
            notifications.notifyUser(s.getMenteeId(), "SESSION_REMINDER", "Nhắc lịch mentoring", msg, "/mentoring/sessions");
            notifications.notifyUser(s.getMentorId(), "SESSION_REMINDER", "Nhắc lịch mentoring", msg, "/mentoring/sessions");
            s.setReminderSent(true);
            log.info("Reminder sent for session {}", s.getId());
        }
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 40_000)
    @Transactional
    public void expireUnpaidSessions() {
        for (MentoringSession s : sessionRepo.findExpiredPending(OffsetDateTime.now().minus(paymentHold))) {
            s.setStatus(MentoringSession.Status.CANCELLED);
            notifications.notifyUser(s.getMenteeId(), "SESSION_EXPIRED", "Phiên đã bị huỷ",
                    "Phiên chưa được thanh toán trong " + paymentHold.toMinutes() + " phút nên đã tự động huỷ.", "/mentoring/sessions");
        }
    }

    @Scheduled(fixedDelay = 300_000, initialDelay = 60_000)
    @Transactional
    public void autoCompleteFinishedSessions() {
        OffsetDateTime threshold = OffsetDateTime.now().minusHours(2);
        sessionRepo.findAll().stream()
                .filter(s -> s.getStatus() == MentoringSession.Status.CONFIRMED && s.endsAt().isBefore(threshold))
                .forEach(s -> {
                    s.setStatus(MentoringSession.Status.COMPLETED);
                    notifications.notifyUser(s.getMenteeId(), "SESSION_COMPLETED", "Phiên mentoring đã hoàn thành",
                            "Hãy đánh giá mentor sau phiên học nhé!", "/mentoring/sessions");
                });
    }
}
