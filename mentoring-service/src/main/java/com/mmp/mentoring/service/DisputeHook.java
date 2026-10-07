package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.MentoringSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * US-12 → US-32 HOOK. Được gọi (sau khi commit) mỗi khi một phiên chuyển sang DISPUTED vì hai bên trả lời tham dự mâu
 * thuẫn. Lúc này giao dịch đã được xếp hàng tạm giữ (outbox HOLD → payment-service ON_HOLD) nên không có tiền nào được
 * trả cho mentor hay hoàn cho mentee.
 *
 * <p>Sprint 3 (US-32) thay phần thân bằng: tạo bản ghi tranh chấp (disputes: session_id, câu trả lời 2 bên, bằng chứng,
 * hạn xử lý), và khi admin kết luận thì gọi POST /internal/payments/release (trả mentor) hoặc /internal/payments/refund
 * (hoàn mentee, sau release) rồi chuyển phiên sang trạng thái cuối. Hiện tại chỉ báo admin.
 */
@Component
public class DisputeHook {

    private static final Logger log = LoggerFactory.getLogger(DisputeHook.class);

    private final NotificationService notifications;

    public DisputeHook(NotificationService notifications) {
        this.notifications = notifications;
    }

    public void sessionDisputed(MentoringSession s) {
        log.warn("Session {} DISPUTED (mentee={}, mentor={}) — payment on hold, waiting for dispute handling (US-32)",
                s.getId(), s.getMenteeAttendance(), s.getMentorAttendance());
        notifications.notifyRole("ADMIN", "SESSION_DISPUTED", "Phiên mentoring có tranh chấp",
                "Phiên " + s.getId() + ": mentee trả lời " + s.getMenteeAttendance() + ", mentor trả lời " + s.getMentorAttendance()
                        + ". Giao dịch đang được tạm giữ.", "/admin");
    }
}
