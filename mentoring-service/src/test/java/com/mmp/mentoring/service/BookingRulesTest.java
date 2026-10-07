package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient.AvailabilityException;
import com.mmp.mentoring.client.ProfileClient.AvailabilitySlot;
import com.mmp.mentoring.client.ProfileClient.MentorStatus;
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

    @Test
    void onlyStandardDurationsAreAllowed() {
        assertThat(List.of(30, 45, 60, 90, 120)).allMatch(BookingRules::isAllowedDuration);
        assertThat(List.of(15, 40, 75, 150, 180)).noneMatch(BookingRules::isAllowedDuration);
        assertThat(BookingRules.isAllowedDuration(null)).isFalse();
    }

    @Test
    void preReadLinkMustBeAbsoluteHttpUrl() {
        assertThat(BookingRules.isHttpUrl("https://github.com/me/repo")).isTrue();
        assertThat(BookingRules.isHttpUrl("http://example.com/doc.pdf")).isTrue();
        assertThat(BookingRules.isHttpUrl("ftp://example.com/file")).isFalse();
        assertThat(BookingRules.isHttpUrl("javascript:alert(1)")).isFalse();
        assertThat(BookingRules.isHttpUrl("not a url")).isFalse();
        assertThat(BookingRules.isHttpUrl("/relative/path")).isFalse();
    }

    // ---------- US-05: buffer, ngoại lệ, trạng thái mentor, thời gian báo trước ----------

    private static BookingRules.Block block(OffsetDateTime start, int minutes) {
        return new BookingRules.Block(UUID.randomUUID(), start, minutes);
    }

    @Test
    void bufferExtendsExistingSessionOnBothSides() {
        // Phiên 10:00–11:00, buffer 15 → bận tới 11:15 và phiên mới phải kết thúc trước 09:45
        List<BookingRules.Block> busy = List.of(block(vn(2026, 9, 26, 10, 0), 60));
        assertThat(BookingRules.findConflict(vn(2026, 9, 26, 11, 0), 30, busy, null, 15)).isPresent();
        assertThat(BookingRules.findConflict(vn(2026, 9, 26, 11, 10), 30, busy, null, 15)).isPresent();
        assertThat(BookingRules.findConflict(vn(2026, 9, 26, 11, 15), 30, busy, null, 15)).isEmpty();
        assertThat(BookingRules.findConflict(vn(2026, 9, 26, 9, 0), 60, busy, null, 15)).isPresent();
        assertThat(BookingRules.findConflict(vn(2026, 9, 26, 9, 0), 45, busy, null, 15)).isEmpty();
        // không buffer thì nối tiếp được
        assertThat(BookingRules.findConflict(vn(2026, 9, 26, 11, 0), 30, busy, null, 0)).isEmpty();
    }

    @Test
    void conflictIgnoresExcludedSession() {
        BookingRules.Block own = block(vn(2026, 9, 26, 10, 0), 60);
        assertThat(BookingRules.findConflict(vn(2026, 9, 26, 10, 30), 60, List.of(own), own.sessionId(), 15)).isEmpty();
    }

    @Test
    void blocksOfOnlyCountsHoldingSessions() {
        List<BookingRules.Block> blocks = BookingRules.blocksOf(List.of(
                session(vn(2026, 9, 26, 9, 0), MentoringSession.Status.CONFIRMED),
                session(vn(2026, 9, 26, 10, 0), MentoringSession.Status.PENDING),
                session(vn(2026, 9, 26, 11, 0), MentoringSession.Status.CANCELLED),
                session(vn(2026, 9, 26, 12, 0), MentoringSession.Status.COMPLETED)));
        assertThat(blocks).extracting(BookingRules.Block::start).containsExactly(vn(2026, 9, 26, 9, 0), vn(2026, 9, 26, 10, 0));
    }

    @Test
    void wholeDayAndPartialExceptionsAreSubtracted() {
        List<AvailabilityException> exceptions = List.of(
                new AvailabilityException(LocalDate.of(2026, 9, 21), null, null),                          // nghỉ cả Thứ Hai 21/09
                new AvailabilityException(LocalDate.of(2026, 9, 26), LocalTime.of(9, 30), LocalTime.of(10, 30))); // bận 9:30–10:30 Thứ Bảy
        assertThat(BookingRules.hitsException(vn(2026, 9, 21, 19, 0), 60, exceptions, VN)).isTrue();
        assertThat(BookingRules.hitsException(vn(2026, 9, 28, 19, 0), 60, exceptions, VN)).isFalse(); // Thứ Hai tuần sau
        assertThat(BookingRules.hitsException(vn(2026, 9, 26, 9, 0), 30, exceptions, VN)).isFalse();  // 9:00–9:30 nối tiếp
        assertThat(BookingRules.hitsException(vn(2026, 9, 26, 9, 0), 60, exceptions, VN)).isTrue();
        assertThat(BookingRules.hitsException(vn(2026, 9, 26, 10, 30), 60, exceptions, VN)).isFalse();
        assertThat(BookingRules.fitsSchedule(vn(2026, 9, 26, 10, 30), 60, slots, exceptions, VN)).isTrue();
        assertThat(BookingRules.fitsSchedule(vn(2026, 9, 26, 10, 0), 60, slots, exceptions, VN)).isFalse();
    }

    @Test
    void availableStartsApplyBufferExceptionsAndCallerBusy() {
        var calendar = new BookingRules.MentorCalendar(slots,
                List.of(new AvailabilityException(LocalDate.of(2026, 9, 21), null, null)), 15,
                MentorStatus.ACCEPTING, null);
        // Thứ Bảy 26/09 09:00–11:30: mentor có phiên 09:00–09:30 (buffer 15 → bận tới 09:45)
        List<BookingRules.Block> mentorBusy = List.of(block(vn(2026, 9, 26, 9, 0), 30));
        // người đặt bận 10:30–11:00
        List<BookingRules.Block> callerBusy = List.of(block(vn(2026, 9, 26, 10, 30), 30));
        List<OffsetDateTime> starts = BookingRules.availableStarts(vn(2026, 9, 21, 0, 0), vn(2026, 9, 27, 0, 0), 30, 30,
                calendar, mentorBusy, callerBusy, null, VN);
        // Thứ Hai bị ngoại lệ cả ngày; 09:30 bị buffer chặn; 10:30 trùng lịch người đặt
        assertThat(starts).containsExactly(vn(2026, 9, 26, 10, 0), vn(2026, 9, 26, 11, 0));
    }

    @Test
    void mentorStatusRules() {
        LocalDate day = LocalDate.of(2026, 9, 26);
        assertThat(BookingRules.statusBlock(MentorStatus.ACCEPTING, null, day)).isEmpty();
        assertThat(BookingRules.statusBlock(MentorStatus.PAUSED, null, day)).isEmpty(); // mentee đã được nhận vẫn đặt được
        assertThat(BookingRules.statusBlock(MentorStatus.SUSPENDED, null, day)).contains("MENTOR_SUSPENDED");
        assertThat(BookingRules.statusBlock(MentorStatus.ON_LEAVE, null, day)).contains("MENTOR_ON_LEAVE");
        assertThat(BookingRules.statusBlock(MentorStatus.ON_LEAVE, day, day)).contains("MENTOR_ON_LEAVE");
        assertThat(BookingRules.statusBlock(MentorStatus.ON_LEAVE, day.minusDays(1), day)).isEmpty(); // sau kỳ nghỉ
    }

    @Test
    void availableStartsSkipLeaveDaysAndSuspendedMentor() {
        var onLeave = new BookingRules.MentorCalendar(slots, List.of(), 0, MentorStatus.ON_LEAVE, LocalDate.of(2026, 9, 22));
        List<OffsetDateTime> starts = BookingRules.availableStarts(vn(2026, 9, 21, 0, 0), vn(2026, 9, 27, 0, 0), 60, 30,
                onLeave, List.of(), List.of(), null, VN);
        assertThat(starts).isNotEmpty().allMatch(s -> s.atZoneSameInstant(VN).toLocalDate().isAfter(LocalDate.of(2026, 9, 22)));
        var suspended = new BookingRules.MentorCalendar(slots, List.of(), 0, MentorStatus.SUSPENDED, null);
        assertThat(BookingRules.availableStarts(vn(2026, 9, 21, 0, 0), vn(2026, 9, 27, 0, 0), 60, 30,
                suspended, List.of(), List.of(), null, VN)).isEmpty();
    }

    @Test
    void leadTimeIsMaxOfPlatformAndMentorNotice() {
        assertThat(BookingRules.effectiveLeadTime(Duration.ofHours(1), 12)).isEqualTo(Duration.ofHours(12));
        assertThat(BookingRules.effectiveLeadTime(Duration.ofHours(1), 0)).isEqualTo(Duration.ofHours(1));
    }

    private static MentoringSession session(OffsetDateTime start, MentoringSession.Status status) {
        MentoringSession s = new MentoringSession();
        s.setScheduledAt(start);
        s.setDurationMinutes(60);
        s.setStatus(status);
        return s;
    }
}
