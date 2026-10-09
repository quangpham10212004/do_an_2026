package com.mmp.mentoring.service;

import java.time.Duration;
import java.time.OffsetDateTime;

/**
 * US-31 (PRD-REQ-6) — quan hệ ACCEPTED không hoạt động, dạng hàm thuần.
 *
 * <p>Mốc hoạt động gần nhất = max(lúc chấp nhận, lúc tạo phiên mới nhất của cặp, giờ bắt đầu phiên chưa huỷ muộn nhất)
 * — phiên đã lên lịch trong tương lai nên quan hệ có phiên sắp tới luôn được coi là đang hoạt động. Chưa có nhắn tin nên
 * "không có tin nhắn" trong PRD chưa được tính.
 * <ul>
 *   <li>Chưa nhắc và không hoạt động ≥ 30 ngày ({@code app.requests.inactivity-warn-after}) → WARN ("Bạn có muốn tiếp tục?").</li>
 *   <li>Đã nhắc mà có hoạt động sau lúc nhắc (đặt phiên mới) → CLEAR.</li>
 *   <li>Đã nhắc, thêm 7 ngày ({@code app.requests.inactivity-end-after}) vẫn không có phiên mới → END (reason INACTIVE).</li>
 * </ul>
 */
public final class InactivityRules {

    public enum Action { NONE, WARN, CLEAR, END }

    private InactivityRules() {
    }

    public static Action decide(OffsetDateTime lastActivity, OffsetDateTime warnedAt, OffsetDateTime now,
                                Duration warnAfter, Duration endAfter) {
        if (warnedAt != null) {
            if (lastActivity != null && lastActivity.isAfter(warnedAt)) return Action.CLEAR;
            return !now.isBefore(warnedAt.plus(endAfter)) ? Action.END : Action.NONE;
        }
        if (lastActivity == null) return Action.NONE;
        return !now.isBefore(lastActivity.plus(warnAfter)) ? Action.WARN : Action.NONE;
    }
}
