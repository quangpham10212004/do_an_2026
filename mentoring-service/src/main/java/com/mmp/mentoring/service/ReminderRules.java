package com.mmp.mentoring.service;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * US-34 (PRD-SES-14) — quy tắc thuần của nhắc lịch (không I/O để unit test).
 *
 * - Nhắc 24 giờ: gửi khi còn ≤ 24 giờ và > 1 giờ tới giờ bắt đầu (phiên đặt sát giờ, vd. còn 10 giờ, vẫn nhận nhắc này).
 * - Nhắc 1 giờ: gửi khi còn ≤ 1 giờ; nếu chưa gửi nhắc 24 giờ thì bỏ qua luôn mốc đó (chỉ nhắc 1 lần).
 * - Nội dung theo múi giờ của từng người nhận, kèm link tham gia và agenda.
 */
public final class ReminderRules {

    private ReminderRules() {
    }

    public enum Kind {
        H24("SESSION_REMINDER_24H", "Nhắc lịch: phiên mentoring ngày mai", Duration.ofHours(24)),
        H1("SESSION_REMINDER_1H", "Nhắc lịch: phiên mentoring sau 1 giờ", Duration.ofHours(1));

        public final String type;
        public final String title;
        public final Duration before;

        Kind(String type, String title, Duration before) {
            this.type = type;
            this.title = title;
            this.before = before;
        }
    }

    public static final Duration WINDOW = Kind.H24.before;
    private static final DateTimeFormatter DISPLAY = DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy");
    static final int AGENDA_PREVIEW = 300;

    /** Lần nhắc đến hạn lúc {@code now} (null = chưa / không cần nhắc). */
    public static Kind due(OffsetDateTime start, OffsetDateTime now, boolean sent24h, boolean sent1h) {
        if (start == null || !now.isBefore(start)) return null;
        Duration left = Duration.between(now, start);
        if (!sent1h && left.compareTo(Kind.H1.before) <= 0) return Kind.H1;
        if (!sent24h && !sent1h && left.compareTo(Kind.H24.before) <= 0) return Kind.H24;
        return null;
    }

    /** "Phiên mentoring với Nguyễn A lúc 19:00 20/09/2026 (Asia/Ho_Chi_Minh) — 60 phút. Link tham gia: … Agenda: …" */
    public static String message(Kind kind, OffsetDateTime start, int durationMinutes, ZoneId zone, String counterpart,
                                 String meetingLink, String agenda) {
        StringBuilder sb = new StringBuilder();
        sb.append(kind == Kind.H1 ? "Sắp bắt đầu: phiên mentoring" : "Phiên mentoring");
        if (counterpart != null && !counterpart.isBlank()) sb.append(" với ").append(counterpart);
        sb.append(" lúc ").append(start.atZoneSameInstant(zone).format(DISPLAY)).append(" (").append(zone.getId()).append(")")
                .append(" — ").append(durationMinutes).append(" phút.");
        sb.append(meetingLink == null || meetingLink.isBlank()
                ? " Mentor chưa thêm link phòng họp."
                : " Link tham gia: " + meetingLink);
        if (agenda != null && !agenda.isBlank()) {
            String a = agenda.strip().replaceAll("\\s+", " ");
            sb.append(" Agenda: ").append(a.length() > AGENDA_PREVIEW ? a.substring(0, AGENDA_PREVIEW - 1) + "…" : a);
        }
        return sb.toString();
    }
}
