package com.mmp.mentoring.service;

import com.mmp.mentoring.client.ProfileClient;
import com.mmp.mentoring.entity.MentoringSession;
import com.mmp.mentoring.exception.ApiException;
import com.mmp.mentoring.repository.SessionRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

/**
 * Kiểm tra một khung giờ có đặt được không — dùng chung cho đặt lịch, buổi làm quen và đổi lịch
 * để các luồng này luôn áp cùng một bộ quy tắc (FR-5.4).
 */
@Component
public class BookingValidator {

    /** Phiên dài nhất được phép; dùng để mở rộng cửa sổ tìm phiên có thể trùng giờ. */
    public static final int MAX_DURATION_MINUTES = 180;

    private final SessionRepository sessionRepo;
    private final ZoneId zone;
    private final Duration minLeadTime;
    private final Duration maxAdvance;

    public BookingValidator(SessionRepository sessionRepo,
                            @Value("${app.timezone}") String timezone,
                            @Value("${app.booking.min-lead-time}") Duration minLeadTime,
                            @Value("${app.booking.max-advance}") Duration maxAdvance) {
        this.sessionRepo = sessionRepo;
        this.zone = ZoneId.of(timezone);
        this.minLeadTime = minLeadTime;
        this.maxAdvance = maxAdvance;
    }

    public ZoneId zone() {
        return zone;
    }

    public Duration minLeadTime() {
        return minLeadTime;
    }

    public Duration maxAdvance() {
        return maxAdvance;
    }

    /** Thời điểm phải đủ xa so với hiện tại và không quá xa (không cần DB, gọi ngoài transaction). */
    public void checkWindow(OffsetDateTime start, OffsetDateTime now) {
        if (start.isBefore(now.plus(minLeadTime))) {
            throw ApiException.badRequest("TOO_SOON", "Cần đặt lịch trước giờ bắt đầu ít nhất " + minLeadTime.toHours() + " giờ");
        }
        if (start.isAfter(now.plus(maxAdvance))) {
            throw ApiException.badRequest("TOO_FAR", "Chỉ được đặt lịch trong vòng " + maxAdvance.toDays() + " ngày tới");
        }
    }

    /** Phiên phải nằm trọn trong khung rảnh hằng tuần của mentor. */
    public void checkAvailability(ProfileClient.MentorInfo mentor, OffsetDateTime start, int durationMinutes) {
        if (!BookingRules.fitsAvailability(start, durationMinutes, mentor.availability(), zone)) {
            throw ApiException.conflict("MENTOR_NOT_AVAILABLE",
                    "Mentor không rảnh vào thời điểm này, vui lòng chọn khung giờ trong lịch rảnh của mentor");
        }
    }

    /**
     * Không trùng phiên đang giữ chỗ của mentor hoặc của mentee. Gọi BÊN TRONG transaction đã khoá lịch mentor
     * ({@link SessionRepository#lockMentorSchedule}). {@code excludeSessionId} bỏ qua chính phiên đang được dời.
     */
    public void checkNoConflict(UUID mentorId, UUID menteeId, OffsetDateTime start, int durationMinutes, UUID excludeSessionId) {
        OffsetDateTime windowStart = start.minusMinutes(MAX_DURATION_MINUTES);
        OffsetDateTime windowEnd = start.plusMinutes(durationMinutes);
        List<MentoringSession> mentorBusy = sessionRepo.findActiveAround(mentorId, windowStart, windowEnd);
        BookingRules.findConflict(start, durationMinutes, mentorBusy, excludeSessionId).ifPresent(c -> {
            throw ApiException.conflict("MENTOR_NOT_AVAILABLE", "Mentor đã có lịch vào khung giờ này");
        });
        List<MentoringSession> menteeBusy = sessionRepo.findActiveAround(menteeId, windowStart, windowEnd);
        BookingRules.findConflict(start, durationMinutes, menteeBusy, excludeSessionId).ifPresent(c -> {
            throw ApiException.conflict("MENTEE_SCHEDULE_CONFLICT", "Bạn đã có phiên khác trùng khung giờ này");
        });
    }
}
