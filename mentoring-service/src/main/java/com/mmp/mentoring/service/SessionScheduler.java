package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.repository.SessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Tác vụ nền mỗi phút:
 * - US-34: nhắc lịch 24 giờ và 1 giờ trước giờ bắt đầu cho phiên CONFIRMED.
 * - Phiên PENDING quá hạn thanh toán → EXPIRED để giải phóng khung giờ.
 * - US-12: tới giờ kết thúc CONFIRMED → AWAITING_ATTENDANCE; hết 48 giờ → kết luận tham dự (thay cho tự hoàn thành
 *   sau 2 giờ của Sprint 1).
 */
@Component
public class SessionScheduler {

    private static final Logger log = LoggerFactory.getLogger(SessionScheduler.class);

    private final SessionRepository sessionRepo;
    private final NotificationService notifications;
    private final AttendanceService attendance;
    private final ProfileClient profileClient;
    private final TransactionTemplate tx;
    private final Duration paymentHold;

    public SessionScheduler(SessionRepository sessionRepo, NotificationService notifications, AttendanceService attendance,
                            ProfileClient profileClient, TransactionTemplate tx,
                            @Value("${app.booking.payment-hold}") Duration paymentHold) {
        this.sessionRepo = sessionRepo;
        this.notifications = notifications;
        this.attendance = attendance;
        this.profileClient = profileClient;
        this.tx = tx;
        this.paymentHold = paymentHold;
    }

    /**
     * US-34 (PRD-SES-14) — nhắc 24 giờ và 1 giờ trước giờ bắt đầu, nội dung theo múi giờ của từng người nhận, kèm link
     * tham gia và agenda. Đánh dấu "đã nhắc" bằng UPDATE có điều kiện trước rồi mới gửi (ngoài transaction, vì cần gọi
     * profile-service lấy tên + múi giờ) — mỗi lần nhắc chỉ gửi đúng 1 lần kể cả khi job chạy chồng nhau.
     */
    @Scheduled(fixedDelay = 60_000, initialDelay = 20_000)
    public void sendReminders() {
        OffsetDateTime now = OffsetDateTime.now();
        for (MentoringSession s : sessionRepo.findNeedingReminder(now, now.plus(ReminderRules.WINDOW))) {
            ReminderRules.Kind kind = ReminderRules.due(s.getScheduledAt(), now,
                    s.getReminder24hSentAt() != null, s.getReminder1hSentAt() != null);
            if (kind == null) continue;
            Integer claimed = tx.execute(st -> kind == ReminderRules.Kind.H1
                    ? sessionRepo.claimReminder1h(s.getId(), now) : sessionRepo.claimReminder24h(s.getId(), now));
            if (claimed == null || claimed == 0) continue;
            try {
                remind(s, kind);
                log.info("Reminder {} sent for session {}", kind, s.getId());
            } catch (RuntimeException e) {
                log.warn("Reminder {} for session {} failed: {}", kind, s.getId(), e.getMessage());
            }
        }
    }

    private void remind(MentoringSession s, ReminderRules.Kind kind) {
        Map<UUID, String> names = profileClient.displayNames(List.of(s.getMentorId(), s.getMenteeId()));
        String link = "/mentoring/sessions/" + s.getId() + "/notes";
        for (UUID recipient : List.of(s.getMenteeId(), s.getMentorId())) {
            UUID other = recipient.equals(s.getMenteeId()) ? s.getMentorId() : s.getMenteeId();
            String msg = ReminderRules.message(kind, s.getScheduledAt(), s.getDurationMinutes(), profileClient.timezone(recipient),
                    names.get(other), s.getMeetingLink(), s.getAgenda());
            notifications.notifyUser(recipient, kind.type, kind.title, msg, link);
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
