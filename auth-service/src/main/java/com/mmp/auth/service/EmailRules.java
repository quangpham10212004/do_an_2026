package com.mmp.auth.service;

import com.mmp.auth.entity.NotificationPreferences;

import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/**
 * US-38 (PRD-NOTI-1, NOTI-4) — quy tắc thuần của email thông báo (không I/O để unit test).
 *
 * - Nhóm: REQUESTS, SESSIONS, MESSAGES, REVIEWS, MARKETING (người dùng bật/tắt; marketing tắt mặc định); ACCOUNT
 *   (kết quả xét duyệt tài khoản) và SECURITY (đặt lại mật khẩu, thiết bị mới) luôn gửi.
 * - Giờ yên tĩnh 22:00–07:00 theo múi giờ người nhận: email bị hoãn tới 07:00 — trừ nhắc lịch của phiên bắt đầu trong
 *   khung giờ đó (gửi ngay, vì hoãn tới 07:00 là quá muộn) và email bảo mật.
 */
public final class EmailRules {

    private EmailRules() {
    }

    public enum Category { REQUESTS, SESSIONS, MESSAGES, REVIEWS, MARKETING, ACCOUNT, SECURITY }

    public static final LocalTime QUIET_START = LocalTime.of(22, 0);
    public static final LocalTime QUIET_END = LocalTime.of(7, 0);

    /** Người dùng có nhận email nhóm này không (ACCOUNT / SECURITY luôn có). */
    public static boolean enabled(NotificationPreferences p, Category c) {
        return switch (c) {
            case REQUESTS -> p.isRequests();
            case SESSIONS -> p.isSessions();
            case MESSAGES -> p.isMessages();
            case REVIEWS -> p.isReviews();
            case MARKETING -> p.isMarketing();
            case ACCOUNT, SECURITY -> true;
        };
    }

    public static boolean inQuietHours(LocalTime t) {
        return !t.isBefore(QUIET_START) || t.isBefore(QUIET_END);
    }

    public static boolean isReminder(String type) {
        return type != null && type.startsWith("SESSION_REMINDER");
    }

    /**
     * Thời điểm được gửi. quietHoursOn = tuỳ chọn của người dùng; sessionStart chỉ có với nhắc lịch.
     */
    public static OffsetDateTime sendAt(OffsetDateTime now, ZoneId zone, boolean quietHoursOn, Category category,
                                        String type, OffsetDateTime sessionStart) {
        if (!quietHoursOn || category == Category.SECURITY) return now;
        ZonedDateTime local = now.atZoneSameInstant(zone);
        if (!inQuietHours(local.toLocalTime())) return now;
        if (isReminder(type) && sessionStart != null
                && inQuietHours(sessionStart.atZoneSameInstant(zone).toLocalTime())) {
            return now;
        }
        ZonedDateTime end = local.toLocalTime().isBefore(QUIET_END)
                ? local.with(QUIET_END)
                : local.plusDays(1).with(QUIET_END);
        return end.toOffsetDateTime();
    }
}
