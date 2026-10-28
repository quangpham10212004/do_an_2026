package com.mmp.mentoring.service;

import com.mmp.mentoring.entity.Dispute;
import com.mmp.mentoring.entity.MentoringSession;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * US-12 → US-32. Mỗi khi một phiên chuyển DISPUTED (hai bên trả lời tham dự mâu thuẫn, hoặc lời báo vắng mặt mâu thuẫn nhật ký phòng):
 * {@link #record} ghi tranh chấp NO_SHOW do hệ thống mở TRONG transaction kết luận (cùng lúc giao dịch được xếp hàng HOLD),
 * {@link #afterCommit} thông báo sau khi commit. Admin xử lý ở /admin/disputes.
 */
@Component
public class DisputeHook {

    private static final Logger log = LoggerFactory.getLogger(DisputeHook.class);

    private final DisputeService disputes;

    public DisputeHook(DisputeService disputes) {
        this.disputes = disputes;
    }

    /** Gọi trong transaction. @return tranh chấp vừa tạo, null nếu phiên đã có tranh chấp đang mở. */
    public Dispute record(MentoringSession s) {
        log.warn("Session {} DISPUTED (mentee={}, mentor={}, code={}) — payment on hold, recording dispute",
                s.getId(), s.getMenteeAttendance(), s.getMentorAttendance(), s.getAttendanceResolution());
        return disputes.recordAutomatic(s);
    }

    public void afterCommit(MentoringSession s, Dispute dispute) {
        if (dispute != null) disputes.afterAutomatic(dispute, s);
    }
}
