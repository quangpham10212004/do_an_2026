package com.mmp.mentoring.service;

import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;

/** US-34 (PRD-SES-14) — chọn lần nhắc đến hạn và nội dung theo múi giờ người nhận. */
class ReminderRulesTest {

    private final OffsetDateTime start = OffsetDateTime.parse("2026-11-20T12:00:00Z");

    @Test
    void nothingBefore24hWindow() {
        assertThat(ReminderRules.due(start, start.minusHours(25), false, false)).isNull();
    }

    @Test
    void twentyFourHourReminderInsideWindow() {
        assertThat(ReminderRules.due(start, start.minusHours(24), false, false)).isEqualTo(ReminderRules.Kind.H24);
        assertThat(ReminderRules.due(start, start.minusHours(10), false, false)).isEqualTo(ReminderRules.Kind.H24);
        assertThat(ReminderRules.due(start, start.minusHours(10), true, false)).isNull();
    }

    @Test
    void oneHourReminderOncePerSession() {
        assertThat(ReminderRules.due(start, start.minusMinutes(60), true, false)).isEqualTo(ReminderRules.Kind.H1);
        assertThat(ReminderRules.due(start, start.minusMinutes(5), true, true)).isNull();
    }

    @Test
    void lateBookingSkipsStraightTo1h() {
        assertThat(ReminderRules.due(start, start.minusMinutes(40), false, false)).isEqualTo(ReminderRules.Kind.H1);
    }

    @Test
    void noReminderAfterStart() {
        assertThat(ReminderRules.due(start, start, false, false)).isNull();
        assertThat(ReminderRules.due(start, start.plusMinutes(1), false, false)).isNull();
    }

    @Test
    void messageUsesRecipientTimezoneLinkAndAgenda() {
        String vn = ReminderRules.message(ReminderRules.Kind.H24, start, 60, ZoneId.of("Asia/Ho_Chi_Minh"), "Mentor A",
                "https://meet.google.com/abc-defg-hij", "Review REST API\n  và cache");
        assertThat(vn).contains("với Mentor A").contains("19:00 20/11/2026 (Asia/Ho_Chi_Minh)").contains("60 phút")
                .contains("Link tham gia: https://meet.google.com/abc-defg-hij").contains("Agenda: Review REST API và cache");
        String paris = ReminderRules.message(ReminderRules.Kind.H1, start, 45, ZoneId.of("Europe/Paris"), null, null, null);
        assertThat(paris).startsWith("Sắp bắt đầu").contains("13:00 20/11/2026 (Europe/Paris)").contains("chưa thêm link");
    }

    @Test
    void longAgendaIsTruncated() {
        String msg = ReminderRules.message(ReminderRules.Kind.H24, start, 60, ZoneId.of("UTC"), "X", null, "a".repeat(1000));
        assertThat(msg).contains("…").hasSizeLessThan(500);
    }
}
