package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient.AvailabilitySlot;
import com.mmp.mentoring.entity.MentoringSession;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.*;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class BookingRulesTest {

    private static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");
    // Thứ Hai 19:00-21:00 và Thứ Bảy 09:00-11:30
    private final List<AvailabilitySlot> slots = List.of(
            new AvailabilitySlot(UUID.randomUUID(), 1, LocalTime.of(19, 0), LocalTime.of(21, 0)),
            new AvailabilitySlot(UUID.randomUUID(), 6, LocalTime.of(9, 0), LocalTime.of(11, 30)));

    private static OffsetDateTime vn(int y, int m, int d, int h, int min) {
        return ZonedDateTime.of(y, m, d, h, min, 0, 0, VN).toOffsetDateTime();
    }

    @Test
    void sessionInsideSlotFits() {
        // 2026-09-21 là Thứ Hai
        assertThat(BookingRules.fitsAvailability(vn(2026, 9, 21, 19, 0), 60, slots, VN)).isTrue();
        assertThat(BookingRules.fitsAvailability(vn(2026, 9, 21, 20, 0), 60, slots, VN)).isTrue();
        assertThat(BookingRules.fitsAvailability(vn(2026, 9, 26, 10, 0), 90, slots, VN)).isTrue();
    }

    @Test
    void sessionOutsideOrOverflowingSlotDoesNotFit() {
        assertThat(BookingRules.fitsAvailability(vn(2026, 9, 21, 20, 30), 60, slots, VN)).isFalse(); // tràn quá 21:00
        assertThat(BookingRules.fitsAvailability(vn(2026, 9, 21, 18, 30), 60, slots, VN)).isFalse(); // bắt đầu trước 19:00
        assertThat(BookingRules.fitsAvailability(vn(2026, 9, 22, 19, 0), 60, slots, VN)).isFalse();  // Thứ Ba không rảnh
    }

    @Test
    void availabilityIsEvaluatedInPlatformTimezone() {
        // 12:00 UTC Thứ Hai = 19:00 giờ Việt Nam
        OffsetDateTime utc = OffsetDateTime.of(2026, 9, 21, 12, 0, 0, 0, ZoneOffset.UTC);
        assertThat(BookingRules.fitsAvailability(utc, 60, slots, VN)).isTrue();
    }

    @Test
    void overlapDetection() {
        OffsetDateTime t = vn(2026, 9, 21, 19, 0);
        assertThat(BookingRules.overlaps(t, 60, t.plusMinutes(30), 60)).isTrue();
        assertThat(BookingRules.overlaps(t, 60, t.plusMinutes(60), 60)).isFalse(); // nối tiếp, không chồng
        assertThat(BookingRules.overlaps(t, 60, t.minusMinutes(60), 60)).isFalse();
    }

    @Test
    void cancelledSessionsDoNotBlockSlot() {
        OffsetDateTime t = vn(2026, 9, 21, 19, 0);
        MentoringSession cancelled = session(t, MentoringSession.Status.CANCELLED);
        MentoringSession confirmed = session(t.plusMinutes(90), MentoringSession.Status.CONFIRMED);
        assertThat(BookingRules.findConflict(t, 60, List.of(cancelled, confirmed), null)).isEmpty();
        assertThat(BookingRules.findConflict(t.plusMinutes(60), 60, List.of(cancelled, confirmed), null)).contains(confirmed);
    }

    @Test
    void availableStartsStepThroughSlotsAndFitDuration() {
        // Thứ Hai 21/09 → Thứ Bảy 26/09
        List<OffsetDateTime> starts = BookingRules.availableStarts(
                vn(2026, 9, 21, 0, 0), vn(2026, 9, 27, 0, 0), 60, 30, slots, List.of(), VN);
        assertThat(starts).containsExactly(
                vn(2026, 9, 21, 19, 0), vn(2026, 9, 21, 19, 30), vn(2026, 9, 21, 20, 0),
                vn(2026, 9, 26, 9, 0), vn(2026, 9, 26, 9, 30), vn(2026, 9, 26, 10, 0), vn(2026, 9, 26, 10, 30));
        assertThat(starts).allMatch(s -> BookingRules.fitsAvailability(s, 60, slots, VN));
    }

    @Test
    void availableStartsSkipBusySessionsAndRespectWindow() {
        MentoringSession booked = session(vn(2026, 9, 21, 19, 30), MentoringSession.Status.PENDING);
        MentoringSession cancelled = session(vn(2026, 9, 26, 9, 0), MentoringSession.Status.CANCELLED);
        // earliest = 19:15 nên 19:00 bị loại; phiên 19:30–20:30 chặn 19:30 và 20:00
        List<OffsetDateTime> starts = BookingRules.availableStarts(
                vn(2026, 9, 21, 19, 15), vn(2026, 9, 26, 9, 0), 60, 30, slots, List.of(booked, cancelled), VN);
        assertThat(starts).containsExactly(vn(2026, 9, 26, 9, 0));
    }

    @Test
    void priceIsProportionalToDurationAndRounded() {
        assertThat(BookingRules.price(new BigDecimal("200000"), 60)).isEqualByComparingTo("200000");
        assertThat(BookingRules.price(new BigDecimal("200000"), 90)).isEqualByComparingTo("300000");
        assertThat(BookingRules.price(new BigDecimal("150000"), 45)).isEqualByComparingTo("113000");
        assertThat(BookingRules.price(BigDecimal.ZERO, 60)).isEqualByComparingTo("0");
    }

    private static MentoringSession session(OffsetDateTime start, MentoringSession.Status status) {
        MentoringSession s = new MentoringSession();
        s.setScheduledAt(start);
        s.setDurationMinutes(60);
        s.setStatus(status);
        return s;
    }
}
