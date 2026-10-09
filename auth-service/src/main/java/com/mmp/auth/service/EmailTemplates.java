package com.mmp.auth.service;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;

/**
 * US-38 (PRD-AUTH-2) — mẫu email văn bản thuần (hàm thuần để unit test): xác thực email, đặt lại mật khẩu, nhắc lịch
 * phiên, yêu cầu mentoring mới và mẫu chung cho các thông báo khác. Mọi email thông báo kèm link quản lý tuỳ chọn email.
 */
public final class EmailTemplates {

    private EmailTemplates() {
    }

    public static final String VERIFY_SUBJECT = "Xác thực tài khoản MentorHub";
    public static final String RESET_SUBJECT = "Đặt lại mật khẩu MentorHub";
    static final String FOOTER = "\n\n—\nMentorHub · Nền tảng kết nối mentor–mentee";
    private static final DateTimeFormatter DISPLAY = DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy");

    public static String verifyBody(String frontendUrl, String token) {
        return "Chào bạn,\n\nBấm vào liên kết để xác thực email và bắt đầu gửi yêu cầu, đặt lịch mentoring:\n"
                + trim(frontendUrl) + "/verify-email?token=" + token
                + "\n\nNếu bạn không đăng ký MentorHub, hãy bỏ qua email này." + FOOTER;
    }

    public static String resetBody(String frontendUrl, String token, long validMinutes) {
        return "Chào bạn,\n\nBấm vào liên kết để đặt lại mật khẩu (hiệu lực " + validMinutes + " phút, dùng một lần):\n"
                + trim(frontendUrl) + "/reset-password?token=" + token
                + "\n\nNếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu hiện tại vẫn giữ nguyên." + FOOTER;
    }

    /** Tiêu đề email thông báo: mẫu riêng cho nhắc lịch và yêu cầu mới, còn lại dùng tiêu đề thông báo. */
    public static String notificationSubject(String type, String title) {
        if (type != null && type.startsWith("SESSION_REMINDER")) return "[Nhắc lịch] " + title;
        if ("REQUEST_RECEIVED".equals(type)) return "[Yêu cầu mới] " + title;
        if ("MESSAGE_DIGEST".equals(type)) return "[Tin nhắn] " + title;
        return title;
    }

    /**
     * Nội dung email thông báo. sessionStart (nhắc lịch) được ghi thêm theo múi giờ người nhận; link tương đối được
     * ghép với frontendUrl.
     */
    public static String notificationBody(String frontendUrl, String name, String message, String link,
                                          ZonedDateTime sessionStart, ZoneId zone) {
        StringBuilder sb = new StringBuilder();
        sb.append("Chào ").append(name == null || name.isBlank() ? "bạn" : name).append(",\n\n");
        sb.append(message == null ? "" : message.strip());
        if (sessionStart != null) {
            sb.append("\n\nGiờ bắt đầu: ").append(sessionStart.withZoneSameInstant(zone).format(DISPLAY))
                    .append(" (").append(zone.getId()).append(")");
        }
        if (link != null && !link.isBlank()) {
            sb.append("\n\nXem chi tiết: ").append(link.startsWith("http") ? link : trim(frontendUrl) + link);
        }
        sb.append("\n\nKhông muốn nhận loại email này? Đổi tuỳ chọn tại ").append(trim(frontendUrl)).append("/account#notifications");
        sb.append(FOOTER);
        return sb.toString();
    }

    private static String trim(String url) {
        return url == null ? "" : url.replaceAll("/+$", "");
    }
}
