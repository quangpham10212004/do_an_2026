package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.MentoringSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * US-12 → US-32. Được gọi (sau khi commit) mỗi khi một phiên chuyển sang DISPUTED vì hai bên trả lời tham dự mâu thuẫn.
 * Lúc này giao dịch đã được xếp hàng tạm giữ (outbox HOLD → payment-service ON_HOLD). Hook tạo tranh chấp NO_SHOW do hệ
 * thống mở (US-32) — admin xử lý ở /admin/disputes; thông báo admin + hai bên do {@link DisputeService} gửi.
 */
@Component
public class DisputeHook {

    private static final Logger log = LoggerFactory.getLogger(DisputeHook.class);

    private final DisputeService disputes;

    public DisputeHook(DisputeService disputes) {
        this.disputes = disputes;
    }

    public void sessionDisputed(MentoringSession s) {
        log.warn("Session {} DISPUTED (mentee={}, mentor={}) — payment on hold, opening dispute",
                s.getId(), s.getMenteeAttendance(), s.getMentorAttendance());
        disputes.openAutomatic(s);
    }
}
