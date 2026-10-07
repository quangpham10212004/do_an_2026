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
 * - Phiên PENDING quá hạn thanh toán → EXPIRED để giải phóng khung giờ.
 * - US-12: tới giờ kết thúc CONFIRMED → AWAITING_ATTENDANCE; hết 48 giờ → kết luận tham dự (thay cho tự hoàn thành
 *   sau 2 giờ của Sprint 1).
 */
@Component
public class SessionScheduler {

    private static final Logger log = LoggerFactory.getLogger(SessionScheduler.class);
    private static final DateTimeFormatter DISPLAY = DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy");

    private final SessionRepository sessionRepo;
    private final NotificationService notifications;
    private final AttendanceService attendance;
    private final Duration reminderBefore;
    private final Duration paymentHold;
    private final ZoneId zone;

    public SessionScheduler(SessionRepository sessionRepo, NotificationService notifications, AttendanceService attendance,
                            @Value("${app.reminder.before}") Duration reminderBefore,
                            @Value("${app.booking.payment-hold}") Duration paymentHold,
                            @Value("${app.timezone}") String timezone) {
        this.sessionRepo = sessionRepo;
        this.notifications = notifications;
        this.attendance = attendance;
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
            s.setStatus(MentoringSession.Status.EXPIRED);
            s.setCancelledBy("SYSTEM");
            s.setCancelReason("PAYMENT_TIMEOUT");
            s.setRefundPercent(0);
            s.setCancelledAt(OffsetDateTime.now());
            notifications.notifyUser(s.getMenteeId(), "SESSION_EXPIRED", "Phiên đã hết hạn",
                    "Phiên chưa được thanh toán trong " + paymentHold.toMinutes() + " phút nên đã hết hạn và khung giờ được giải phóng.",
                    "/mentoring/sessions");
        }
    }

    /** US-12 — CONFIRMED đã kết thúc → AWAITING_ATTENDANCE; AWAITING_ATTENDANCE quá 48 giờ → kết luận. */
    @Scheduled(fixedDelayString = "${app.attendance.interval:PT1M}", initialDelayString = "PT50S")
    public void attendanceJob() {
        attendance.runJob();
    }
}
