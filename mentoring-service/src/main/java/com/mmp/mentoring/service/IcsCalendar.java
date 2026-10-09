package com.mmp.mentoring.service;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.UUID;

/**
 * US-34 (PRD-SES-13) — tạo file .ics (RFC 5545) cho một phiên. UID cố định theo id phiên và SEQUENCE = số lần dời lịch nên
 * tải lại sau khi dời lịch sẽ CẬP NHẬT sự kiện cũ trong lịch thay vì tạo sự kiện mới; phiên huỷ → METHOD:CANCEL.
 */
public final class IcsCalendar {

    private IcsCalendar() {
    }

    private static final DateTimeFormatter UTC = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'");
    static final String DOMAIN = "mentorhub.local";

    public record Event(UUID sessionId, OffsetDateTime start, int durationMinutes, int sequence, boolean cancelled,
                       String summary, String description, String location, String url, String organizerName) {
    }

    public static String build(Event e, OffsetDateTime now) {
        StringBuilder sb = new StringBuilder();
        line(sb, "BEGIN:VCALENDAR");
        line(sb, "VERSION:2.0");
        line(sb, "PRODID:-//MentorHub//Mentoring//VI");
        line(sb, "CALSCALE:GREGORIAN");
        line(sb, "METHOD:" + (e.cancelled() ? "CANCEL" : "PUBLISH"));
        line(sb, "BEGIN:VEVENT");
        line(sb, "UID:session-" + e.sessionId() + "@" + DOMAIN);
        line(sb, "SEQUENCE:" + e.sequence());
        line(sb, "DTSTAMP:" + utc(now));
        line(sb, "DTSTART:" + utc(e.start()));
        line(sb, "DTEND:" + utc(e.start().plusMinutes(e.durationMinutes())));
        line(sb, "SUMMARY:" + escape(e.summary()));
        if (e.description() != null && !e.description().isBlank()) line(sb, "DESCRIPTION:" + escape(e.description()));
        if (e.location() != null && !e.location().isBlank()) line(sb, "LOCATION:" + escape(e.location()));
        if (e.url() != null && !e.url().isBlank()) line(sb, "URL:" + e.url());
        if (e.organizerName() != null && !e.organizerName().isBlank()) {
            line(sb, "ORGANIZER;CN=" + quoteParam(e.organizerName()) + ":mailto:no-reply@" + DOMAIN);
        }
        line(sb, "STATUS:" + (e.cancelled() ? "CANCELLED" : "CONFIRMED"));
        if (!e.cancelled()) {
            line(sb, "BEGIN:VALARM");
            line(sb, "ACTION:DISPLAY");
            line(sb, "DESCRIPTION:" + escape(e.summary()));
            line(sb, "TRIGGER:-PT15M");
            line(sb, "END:VALARM");
        }
        line(sb, "END:VEVENT");
        line(sb, "END:VCALENDAR");
        return sb.toString();
    }

    static String utc(OffsetDateTime t) {
        return t.withOffsetSameInstant(ZoneOffset.UTC).format(UTC);
    }

    /** TEXT theo RFC 5545 §3.3.11: \\ ; , và xuống dòng. */
    static String escape(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
                .replace("\r\n", "\\n").replace("\n", "\\n").replace("\r", "\\n");
    }

    private static String quoteParam(String s) {
        return "\"" + s.replace("\"", "'") + "\"";
    }

    /** Ghi 1 dòng nội dung, gấp dòng ở 75 octet UTF-8 (dòng tiếp theo bắt đầu bằng 1 dấu cách), kết thúc CRLF. */
    static void line(StringBuilder sb, String content) {
        int octets = 0;
        int limit = 75;
        for (int i = 0; i < content.length(); ) {
            int cp = content.codePointAt(i);
            int len = new String(Character.toChars(cp)).getBytes(StandardCharsets.UTF_8).length;
            if (octets + len > limit) {
                sb.append("\r\n ");
                octets = 1;
            }
            sb.appendCodePoint(cp);
            octets += len;
            i += Character.charCount(cp);
        }
        sb.append("\r\n");
    }
}
