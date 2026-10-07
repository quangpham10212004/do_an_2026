package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient.AvailabilityException;
import com.mmp.mentoring.client.ProfileClient.AvailabilitySlot;
import com.mmp.mentoring.client.ProfileClient.MentorStatus;
import com.mmp.mentoring.entity.MentoringSession;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.*;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Các quy tắc đặt lịch dạng hàm thuần (không truy cập DB/mạng) để dễ kiểm thử (FR-5.4, PRD-SES-1, PRD-SES-2).
 */
public final class BookingRules {

    /** US-03 — các thời lượng phiên được phép (phút). */
    public static final Set<Integer> ALLOWED_DURATIONS = Set.of(30, 45, 60, 90, 120);
    public static final int MAX_DURATION_MINUTES = 120;
    /** Phiên cũ (trước US-03) có thể dài tới 240 phút (CHECK của bảng sessions) — dùng khi quét trùng lịch. */
    public static final int MAX_STORED_DURATION_MINUTES = 240;
    public static final int AGENDA_MIN = 20;
    public static final int AGENDA_MAX = 500;

    /** Trạng thái phiên đang giữ chỗ trên lịch. */
    public static final Set<MentoringSession.Status> HOLDING_STATUSES =
            Set.of(MentoringSession.Status.PENDING, MentoringSession.Status.CONFIRMED);

    /**
     * Một khoảng thời gian đang bận: phiên đang giữ chỗ hoặc khung giờ của đề xuất dời lịch đang chờ (US-06).
     * {@code sessionId} = phiên sở hữu khoảng bận (để bỏ qua chính phiên đang dời lịch).
     */
    public record Block(UUID sessionId, OffsetDateTime start, int minutes) {
        public OffsetDateTime end() {
            return start.plusMinutes(minutes);
        }
    }

    private BookingRules() {
    }

    public static boolean isAllowedDuration(Integer minutes) {
        return minutes != null && ALLOWED_DURATIONS.contains(minutes);
    }

    /** URL tuyệt đối http/https có host. */
    public static boolean isHttpUrl(String value) {
        if (value == null) return false;
        try {
            URI uri = new URI(value.trim());
            String scheme = uri.getScheme();
            return ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) && uri.getHost() != null;
        } catch (URISyntaxException e) {
            return false;
        }
    }

    /**
     * Phiên [start, start + duration) phải nằm TRỌN trong một khung giờ rảnh hằng tuần
     * của mentor (so sánh theo giờ địa phương của nền tảng).
     */
    public static boolean fitsAvailability(OffsetDateTime start, int durationMinutes, List<AvailabilitySlot> slots, ZoneId zone) {
        ZonedDateTime localStart = start.atZoneSameInstant(zone);
        ZonedDateTime localEnd = localStart.plusMinutes(durationMinutes);
        if (!localStart.toLocalDate().equals(localEnd.toLocalDate())) {
            return false; // không hỗ trợ phiên kéo dài qua nửa đêm
        }
        int day = localStart.getDayOfWeek().getValue();
        LocalTime s = localStart.toLocalTime();
        LocalTime e = localEnd.toLocalTime();
        return slots.stream().anyMatch(slot -> slot.dayOfWeek() == day
                && !s.isBefore(slot.startTime())
                && !e.isAfter(slot.endTime()));
    }

    /**
     * US-05 — phiên có rơi vào ngày nghỉ / giờ bận đột xuất của mentor không. Ngoại lệ không có giờ
     * (startTime/endTime null) chặn cả ngày; ngoại lệ có giờ chặn khoảng [startTime, endTime) của ngày đó.
     */
    public static boolean hitsException(OffsetDateTime start, int durationMinutes, List<AvailabilityException> exceptions, ZoneId zone) {
        ZonedDateTime localStart = start.atZoneSameInstant(zone);
        LocalDate date = localStart.toLocalDate();
        LocalTime s = localStart.toLocalTime();
        LocalTime e = localStart.plusMinutes(durationMinutes).toLocalTime();
        return exceptions.stream().filter(x -> date.equals(x.date())).anyMatch(x -> x.wholeDay()
                || (s.isBefore(x.endTime()) && x.startTime().isBefore(e)));
    }

    /** Lịch rảnh hằng tuần trừ đi ngày nghỉ / giờ bận đột xuất. */
    public static boolean fitsSchedule(OffsetDateTime start, int durationMinutes, List<AvailabilitySlot> slots,
                                       List<AvailabilityException> exceptions, ZoneId zone) {
        return fitsAvailability(start, durationMinutes, slots, zone) && !hitsException(start, durationMinutes, exceptions, zone);
    }

    /**
     * US-05 — mã lỗi nếu trạng thái mentor không cho đặt phiên vào ngày {@code sessionDate}; empty = cho phép.
     * ON_LEAVE chặn tới hết {@code onLeaveUntil} (không có ngày kết thúc = chặn hẳn); SUSPENDED chặn hẳn;
     * PAUSED chỉ ngừng nhận mentee mới — mentee đã được chấp nhận vẫn đặt lịch được.
     */
    public static Optional<String> statusBlock(MentorStatus status, LocalDate onLeaveUntil, LocalDate sessionDate) {
        return switch (status) {
            case SUSPENDED -> Optional.of("MENTOR_SUSPENDED");
            case ON_LEAVE -> onLeaveUntil == null || !sessionDate.isAfter(onLeaveUntil) ? Optional.of("MENTOR_ON_LEAVE") : Optional.empty();
            case ACCEPTING, PAUSED -> Optional.empty();
        };
    }

    /** Lead time hiệu lực = max(cấu hình nền tảng, minNoticeHours của mentor). */
    public static Duration effectiveLeadTime(Duration platformMinimum, int mentorMinNoticeHours) {
        Duration mentor = Duration.ofHours(Math.max(0, mentorMinNoticeHours));
        return mentor.compareTo(platformMinimum) > 0 ? mentor : platformMinimum;
    }

    /** Hai khoảng thời gian [a, a+da) và [b, b+db) có giao nhau không. */
    public static boolean overlaps(OffsetDateTime a, int da, OffsetDateTime b, int db) {
        return a.isBefore(b.plusMinutes(db)) && b.isBefore(a.plusMinutes(da));
    }

    /** Các phiên đang giữ chỗ (PENDING/CONFIRMED) dưới dạng khoảng bận. */
    public static List<Block> blocksOf(Collection<MentoringSession> sessions) {
        return sessions.stream()
                .filter(s -> HOLDING_STATUSES.contains(s.getStatus()))
                .map(s -> new Block(s.getId(), s.getScheduledAt(), s.getDurationMinutes()))
                .toList();
    }

    /**
     * Tìm khoảng bận trùng với phiên mới (bỏ qua khoảng của phiên {@code excludeSessionId}).
     * {@code bufferMinutes} = thời gian nghỉ tối thiểu giữa 2 phiên của mentor, áp dụng cả trước và sau:
     * phiên 10:00–11:00 với buffer 15 chặn tới 11:15, và phiên mới phải kết thúc trước 09:45.
     */
    public static Optional<Block> findConflict(OffsetDateTime start, int duration, List<Block> busy, UUID excludeSessionId, int bufferMinutes) {
        int buffer = Math.max(0, bufferMinutes);
        return busy.stream()
                .filter(b -> excludeSessionId == null || !excludeSessionId.equals(b.sessionId()))
                .filter(b -> overlaps(start, duration + buffer, b.start(), b.minutes() + buffer))
                .findFirst();
    }

    /** Tìm phiên đang giữ chỗ bị trùng giờ (không buffer) — giữ cho mã cũ / kiểm tra phía mentee. */
    public static Optional<MentoringSession> findConflict(OffsetDateTime start, int duration, List<MentoringSession> existing, UUID excludeId) {
        return existing.stream()
                .filter(s -> excludeId == null || !excludeId.equals(s.getId()))
                .filter(s -> HOLDING_STATUSES.contains(s.getStatus()))
                .filter(s -> overlaps(start, duration, s.getScheduledAt(), s.getDurationMinutes()))
                .findFirst();
    }

    /** Toàn bộ dữ kiện lịch của mentor cần cho việc liệt kê giờ trống. */
    public record MentorCalendar(List<AvailabilitySlot> weekly, List<AvailabilityException> exceptions, int bufferMinutes,
                                 MentorStatus status, LocalDate onLeaveUntil) {
    }

    /**
     * Liệt kê các thời điểm bắt đầu đặt được trong [earliest, latest]: bước {@code stepMinutes} tính từ
     * đầu mỗi khung rảnh, phiên nằm trọn trong khung, không rơi vào ngoại lệ, trạng thái mentor cho phép,
     * không trùng khoảng bận của mentor (có buffer) và của người đặt (không buffer).
     * Dùng cho bộ chọn khung giờ ở giao diện; kiểm tra chốt khi đặt lịch dùng cùng các hàm.
     */
    public static List<OffsetDateTime> availableStarts(OffsetDateTime earliest, OffsetDateTime latest, int durationMinutes,
                                                       int stepMinutes, MentorCalendar calendar,
                                                       List<Block> mentorBusy, List<Block> callerBusy,
                                                       UUID excludeSessionId, ZoneId zone) {
        List<OffsetDateTime> result = new ArrayList<>();
        LocalDate lastDay = latest.atZoneSameInstant(zone).toLocalDate();
        for (LocalDate day = earliest.atZoneSameInstant(zone).toLocalDate(); !day.isAfter(lastDay); day = day.plusDays(1)) {
            if (statusBlock(calendar.status(), calendar.onLeaveUntil(), day).isPresent()) continue;
            int dow = day.getDayOfWeek().getValue();
            for (AvailabilitySlot slot : calendar.weekly()) {
                if (slot.dayOfWeek() != dow) continue;
                int endMinute = slot.endTime().toSecondOfDay() / 60;
                for (int m = slot.startTime().toSecondOfDay() / 60; m + durationMinutes <= endMinute; m += stepMinutes) {
                    OffsetDateTime start = day.atStartOfDay(zone).plusMinutes(m).toOffsetDateTime();
                    if (start.isBefore(earliest) || start.isAfter(latest)) continue;
                    if (hitsException(start, durationMinutes, calendar.exceptions(), zone)) continue;
                    if (findConflict(start, durationMinutes, mentorBusy, excludeSessionId, calendar.bufferMinutes()).isPresent()) continue;
                    if (findConflict(start, durationMinutes, callerBusy, excludeSessionId, 0).isPresent()) continue;
                    result.add(start);
                }
            }
        }
        result.sort(Comparator.naturalOrder());
        return result;
    }

    /** Dạng rút gọn (không ngoại lệ, không buffer, mentor ACCEPTING) — tương thích test/mã cũ. */
    public static List<OffsetDateTime> availableStarts(OffsetDateTime earliest, OffsetDateTime latest, int durationMinutes,
                                                       int stepMinutes, List<AvailabilitySlot> slots,
                                                       List<MentoringSession> busy, ZoneId zone) {
        MentorCalendar calendar = new MentorCalendar(slots, List.of(), 0, MentorStatus.ACCEPTING, null);
        return availableStarts(earliest, latest, durationMinutes, stepMinutes, calendar, blocksOf(busy), List.of(), null, zone);
    }

    /** Giá phiên = đơn giá theo giờ × thời lượng, làm tròn tới 1.000đ. */
    public static BigDecimal price(BigDecimal hourlyRate, int durationMinutes) {
        if (hourlyRate == null || hourlyRate.signum() <= 0) return BigDecimal.ZERO;
        return hourlyRate.multiply(BigDecimal.valueOf(durationMinutes))
                .divide(BigDecimal.valueOf(60 * 1000L), 0, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(1000L));
    }
}
