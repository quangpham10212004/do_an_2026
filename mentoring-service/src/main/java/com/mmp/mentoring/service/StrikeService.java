package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.entity.MentorStrike;
import com.mmp.mentoring.repository.MentorStrikeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * US-02 — ghi strike cho mentor. Đạt {@code app.strikes.threshold} (3) strike trong {@code app.strikes.window} (30 ngày)
 * → yêu cầu profile-service chuyển mentor sang PAUSED (interface 2, best-effort) và báo admin.
 */
@Service
public class StrikeService {

    private static final Logger log = LoggerFactory.getLogger(StrikeService.class);

    private final MentorStrikeRepository repo;
    private final ProfileClient profileClient;
    private final NotificationService notifications;
    private final TransactionTemplate tx;
    private final int threshold;
    private final Duration window;

    public StrikeService(MentorStrikeRepository repo, ProfileClient profileClient, NotificationService notifications,
                         TransactionTemplate tx,
                         @Value("${app.strikes.threshold:3}") int threshold,
                         @Value("${app.strikes.window:P30D}") Duration window) {
        this.repo = repo;
        this.profileClient = profileClient;
        this.notifications = notifications;
        this.tx = tx;
        this.threshold = threshold;
        this.window = window;
    }

    /** Hàm thuần: số strike trong cửa sổ (đã gồm strike vừa ghi) có tới ngưỡng tạm dừng không. */
    static boolean shouldPause(long strikesInWindow, int threshold) {
        return threshold > 0 && strikesInWindow >= threshold;
    }

    /** Ghi strike (bỏ qua nếu phiên đã có strike cùng lý do) và trả về số strike trong cửa sổ. */
    public long record(UUID mentorId, UUID sessionId, MentorStrike.Reason reason) {
        Long count = tx.execute(s -> {
            if (sessionId != null && repo.existsBySessionIdAndReason(sessionId, reason)) return null;
            repo.save(new MentorStrike(mentorId, sessionId, reason));
            return repo.countByMentorIdAndCreatedAtAfter(mentorId, OffsetDateTime.now().minus(window));
        });
        if (count == null) return 0;
        String label = reason == MentorStrike.Reason.MENTOR_CANCEL ? "huỷ phiên" : "vắng mặt";
        notifications.notifyUser(mentorId, "MENTOR_STRIKE", "Bạn bị ghi nhận 1 lần vi phạm",
                "Lý do: " + label + ". Bạn có " + count + "/" + threshold + " lần vi phạm trong " + window.toDays()
                        + " ngày; đủ " + threshold + " lần tài khoản sẽ tạm dừng nhận mentee.", "/mentoring/sessions");
        if (shouldPause(count, threshold)) {
            log.warn("Mentor {} reached {} strikes in {} — pausing", mentorId, count, window);
            profileClient.updateMentorStatus(mentorId, "PAUSED", "STRIKES");
            notifications.notifyRole("ADMIN", "MENTOR_PAUSED_STRIKES", "Mentor bị tạm dừng do vi phạm",
                    "Mentor " + mentorId + " có " + count + " lần vi phạm trong " + window.toDays() + " ngày và đã được chuyển sang PAUSED.",
                    "/admin/users");
            notifications.notifyUser(mentorId, "MENTOR_PAUSED", "Tài khoản mentor tạm dừng nhận mentee",
                    "Bạn có " + count + " lần vi phạm trong " + window.toDays() + " ngày nên hồ sơ đã chuyển sang tạm dừng. "
                            + "Vui lòng liên hệ quản trị viên.", "/profile");
        }
        return count;
    }
}
