package com.mmp.mentoring.service;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** US-34 (PRD-SES-13) — file .ics: UID cố định + SEQUENCE theo số lần dời lịch, giờ UTC, escape và gấp dòng RFC 5545. */
class IcsCalendarTest {

    private final UUID id = UUID.fromString("11111111-2222-3333-4444-555555555555");
    private final OffsetDateTime start = OffsetDateTime.parse("2026-11-20T19:00:00+07:00");
    private final OffsetDateTime now = OffsetDateTime.parse("2026-11-01T08:00:00Z");

    private IcsCalendar.Event event(int sequence, boolean cancelled, String desc) {
        return new IcsCalendar.Event(id, start, 90, sequence, cancelled, "Mentoring · Review code với Mentor A", desc,
                "https://meet.google.com/abc-defg-hij", "http://localhost:3000/mentoring/sessions/" + id + "/notes", "Mentor A");
    }

    @Test
    void containsStableUidUtcTimesAndCrlf() {
        String ics = IcsCalendar.build(event(0, false, "Agenda"), now);
        assertThat(ics).startsWith("BEGIN:VCALENDAR\r\n").endsWith("END:VCALENDAR\r\n")
                .contains("UID:session-" + id + "@mentorhub.local\r\n")
                .contains("DTSTART:20261120T120000Z\r\n")
                .contains("DTEND:20261120T133000Z\r\n")
                .contains("DTSTAMP:20261101T080000Z\r\n")
                .contains("SEQUENCE:0\r\n")
                .contains("METHOD:PUBLISH").contains("STATUS:CONFIRMED").contains("BEGIN:VALARM");
        assertThat(ics.replace("\r\n", "")).doesNotContain("\n");
    }

    @Test
    void rescheduleBumpsSequenceSoCalendarsUpdateTheSameEvent() {
        String ics = IcsCalendar.build(event(2, false, null), now);
        assertThat(ics).contains("SEQUENCE:2\r\n").contains("UID:session-" + id);
    }

    @Test
    void cancelledSessionProducesCancel() {
        String ics = IcsCalendar.build(event(1, true, null), now);
        assertThat(ics).contains("METHOD:CANCEL").contains("STATUS:CANCELLED").doesNotContain("VALARM");
    }

    @Test
    void textIsEscaped() {
        assertThat(IcsCalendar.escape("a,b;c\\d\ne")).isEqualTo("a\\,b\\;c\\\\d\\ne");
    }

    @Test
    void longLinesAreFoldedAt75Octets() {
        String desc = "Agenda: " + "Ôn tập kiến trúc microservices, ".repeat(10);
        String ics = IcsCalendar.build(event(0, false, desc), now);
        for (String line : ics.split("\r\n")) {
            assertThat(line.getBytes(StandardCharsets.UTF_8).length).isLessThanOrEqualTo(75);
        }
        // Gỡ gấp dòng (CRLF + 1 dấu cách) khôi phục nguyên nội dung.
        assertThat(ics.replace("\r\n ", "")).contains("DESCRIPTION:" + IcsCalendar.escape(desc));
    }
}
