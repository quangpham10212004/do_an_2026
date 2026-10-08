package com.mmp.mentoring.service;

import java.time.Duration;
import java.time.OffsetDateTime;

/**
 * Quy tắc đổi lịch (hàm thuần, không truy cập DB).
 *
 * <ul>
 *   <li>Mentee đổi trước giờ hẹn ít nhất {@code freeWindow} và chưa dùng hết số lần cho phép: áp dụng ngay.</li>
 *   <li>Mentee đổi muộn hơn, hoặc đã dùng hết số lần: cần mentor đồng ý.</li>
 *   <li>Mentor đề xuất: luôn cần mentee đồng ý (mentor bận không được tự dời lịch của mentee).</li>
 *   <li>Admin: áp dụng ngay (xử lý sự cố), không tính vào số lần của mentee.</li>
 * </ul>
 * Chỉ các lần đổi do mentee khởi xướng mới tính vào hạn mức.
 */
public final class ReschedulePolicy {

    public enum Actor { MENTEE, MENTOR, ADMIN }

    public enum Outcome { APPLY_NOW, NEEDS_APPROVAL }

    private ReschedulePolicy() {
    }

    public static Outcome decide(Actor actor, OffsetDateTime now, OffsetDateTime currentStart,
                                 int rescheduleCount, Duration freeWindow, int maxPerSession) {
        return switch (actor) {
            case ADMIN -> Outcome.APPLY_NOW;
            case MENTOR -> Outcome.NEEDS_APPROVAL;
            case MENTEE -> {
                boolean earlyEnough = !currentStart.isBefore(now.plus(freeWindow));
                boolean withinQuota = rescheduleCount < maxPerSession;
                yield earlyEnough && withinQuota ? Outcome.APPLY_NOW : Outcome.NEEDS_APPROVAL;
            }
        };
    }

    /** Lần đổi lịch này có tính vào hạn mức của mentee không (chỉ khi mentee là người khởi xướng). */
    public static boolean countsTowardQuota(Actor initiator) {
        return initiator == Actor.MENTEE;
    }
}
