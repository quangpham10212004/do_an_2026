package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient.AvailabilitySlot;
import com.mmp.mentoring.entity.MentoringSession;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.*;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Các quy tắc đặt lịch dạng hàm thuần (không truy cập DB) để dễ kiểm thử (FR-5.4).
 */
public final class BookingRules {

    private BookingRules() {
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

    /** Hai khoảng thời gian [a, a+da) và [b, b+db) có giao nhau không. */
    public static boolean overlaps(OffsetDateTime a, int da, OffsetDateTime b, int db) {
        return a.isBefore(b.plusMinutes(db)) && b.isBefore(a.plusMinutes(da));
    }

    /** Tìm phiên đang giữ chỗ bị trùng giờ (bỏ qua phiên có id = excludeId). */
    public static Optional<MentoringSession> findConflict(OffsetDateTime start, int duration, List<MentoringSession> existing, UUID excludeId) {
        return existing.stream()
                .filter(s -> excludeId == null || !excludeId.equals(s.getId()))
                .filter(s -> s.getStatus() == MentoringSession.Status.PENDING || s.getStatus() == MentoringSession.Status.CONFIRMED)
                .filter(s -> overlaps(start, duration, s.getScheduledAt(), s.getDurationMinutes()))
                .findFirst();
    }

    /**
     * Liệt kê các thời điểm bắt đầu đặt được trong [earliest, latest]: bước {@code stepMinutes} tính từ
     * đầu mỗi khung rảnh, phiên nằm trọn trong khung và không trùng phiên đang giữ chỗ trong {@code busy}.
     * Dùng cho bộ chọn khung giờ ở giao diện; {@link #fitsAvailability} và {@link #findConflict} vẫn là
     * kiểm tra chốt khi đặt lịch.
     */
    public static List<OffsetDateTime> availableStarts(OffsetDateTime earliest, OffsetDateTime latest, int durationMinutes,
                                                       int stepMinutes, List<AvailabilitySlot> slots,
                                                       List<MentoringSession> busy, ZoneId zone) {
        List<OffsetDateTime> result = new ArrayList<>();
        LocalDate lastDay = latest.atZoneSameInstant(zone).toLocalDate();
        for (LocalDate day = earliest.atZoneSameInstant(zone).toLocalDate(); !day.isAfter(lastDay); day = day.plusDays(1)) {
            int dow = day.getDayOfWeek().getValue();
            for (AvailabilitySlot slot : slots) {
                if (slot.dayOfWeek() != dow) continue;
                int endMinute = slot.endTime().toSecondOfDay() / 60;
                for (int m = slot.startTime().toSecondOfDay() / 60; m + durationMinutes <= endMinute; m += stepMinutes) {
                    OffsetDateTime start = day.atStartOfDay(zone).plusMinutes(m).toOffsetDateTime();
                    if (start.isBefore(earliest) || start.isAfter(latest)) continue;
                    if (findConflict(start, durationMinutes, busy, null).isEmpty()) {
                        result.add(start);
                    }
                }
            }
        }
        result.sort(Comparator.naturalOrder());
        return result;
    }

    /** Giá phiên = đơn giá theo giờ × thời lượng, làm tròn tới 1.000đ. */
    public static BigDecimal price(BigDecimal hourlyRate, int durationMinutes) {
        if (hourlyRate == null || hourlyRate.signum() <= 0) return BigDecimal.ZERO;
        return hourlyRate.multiply(BigDecimal.valueOf(durationMinutes))
                .divide(BigDecimal.valueOf(60 * 1000L), 0, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(1000L));
    }
}
