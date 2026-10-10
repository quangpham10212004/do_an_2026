package com.mmp.profile.dto;

import com.mmp.profile.entity.MenteeProfile;
import com.mmp.profile.entity.MentorAvailability;
import com.mmp.profile.entity.MentorAvailabilityException;
import com.mmp.profile.service.CompletenessRules;
import com.mmp.profile.service.MentorRules;
import com.mmp.profile.entity.MentorProfile;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

public final class ProfileDtos {

    private ProfileDtos() {
    }

    public record MentorProfileInput(
            @NotBlank @Size(max = 100) String displayName,
            @NotNull @Size(min = 1, max = 30, message = "cần khai báo 1-30 kỹ năng") List<@NotBlank @Size(max = 50) String> skills,
            @NotBlank @Size(max = 50) String domain,
            @NotBlank @Size(max = 3000) String bio,
            @Min(0) @Max(60) Integer yearsExperience,
            @Size(max = 500) String cvFileUrl,
            @Size(max = 10) List<@Size(max = 300) String> portfolioLinks,
            @DecimalMin("0") @DecimalMax("100000000") BigDecimal hourlyRate,
            @Min(1) @Max(50) Integer capacity,
            /** Đã thay bằng status (US-08) — vẫn nhận để tương thích: true → ACCEPTING, false → PAUSED. */
            @Deprecated Boolean isAvailable,
            /** US-37 — câu giới thiệu ngắn ≤ 80 ký tự; null = giữ nguyên, chuỗi rỗng = xoá. */
            @Size(max = 80) String headline) {

        /** Tương thích lời gọi cũ (không có headline). */
        public MentorProfileInput(String displayName, List<String> skills, String domain, String bio, Integer yearsExperience,
                                  String cvFileUrl, List<String> portfolioLinks, BigDecimal hourlyRate, Integer capacity,
                                  Boolean isAvailable) {
            this(displayName, skills, domain, bio, yearsExperience, cvFileUrl, portfolioLinks, hourlyRate, capacity,
                    isAvailable, null);
        }
    }

    public record MentorProfileResponse(
            UUID userId,
            String displayName,
            List<String> skills,
            String domain,
            String bio,
            int yearsExperience,
            String cvFileUrl,
            List<String> portfolioLinks,
            BigDecimal hourlyRate,
            int capacity,
            int activeMenteeCount,
            boolean isAvailable,
            float rating,
            int ratingCount,
            String verificationStatus,
            String status,
            LocalDate onLeaveUntil,
            String statusReason,
            String meetingLink,
            int bufferMinutes,
            int minNoticeHours,
            List<String> languages,
            List<String> sessionTypes,
            String timezone,
            List<AvailabilitySlot> availability,
            List<AvailabilityExceptionDto> exceptions,
            String headline,
            String avatarUrl,
            CompletenessRules.Completeness completeness,
            /** US-35 (PRD-MATCH-9) — trung vị thời gian phản hồi yêu cầu (giờ); null = chưa có dữ liệu. */
            BigDecimal medianResponseHours) {

        /** Link họp chỉ cho chủ hồ sơ, admin và service nội bộ (mentoring-service gửi cho mentee khi phiên CONFIRMED). */
        public MentorProfileResponse withoutMeetingLink() {
            return new MentorProfileResponse(userId, displayName, skills, domain, bio, yearsExperience, cvFileUrl,
                    portfolioLinks, hourlyRate, capacity, activeMenteeCount, isAvailable, rating, ratingCount,
                    verificationStatus, status, onLeaveUntil, statusReason, null, bufferMinutes, minNoticeHours,
                    languages, sessionTypes, timezone, availability, exceptions, headline, avatarUrl, completeness,
                    medianResponseHours);
        }

        /**
         * Người xem không phải chủ hồ sơ/admin: bỏ link họp và (US-27) lý do đình chỉ — mentee chỉ thấy
         * trạng thái "Tạm ngưng", lý do nội bộ của admin không công khai.
         */
        public MentorProfileResponse forPublicViewer() {
            String reason = "SUSPENDED".equals(status) ? null : statusReason;
            return new MentorProfileResponse(userId, displayName, skills, domain, bio, yearsExperience, cvFileUrl,
                    portfolioLinks, hourlyRate, capacity, activeMenteeCount, isAvailable, rating, ratingCount,
                    verificationStatus, status, onLeaveUntil, reason, null, bufferMinutes, minNoticeHours,
                    languages, sessionTypes, timezone, availability, exceptions, headline, avatarUrl, null,
                    medianResponseHours);
        }

        /**
         * status = trạng thái HIỆU LỰC (nghỉ phép đã hết hạn tính là ACCEPTING); isAvailable = status == ACCEPTING.
         * exceptions = ngoại lệ lịch rảnh từ hôm nay tới {@link MentorRules#EXCEPTION_HORIZON_DAYS} ngày tới.
         */
        public static MentorProfileResponse from(MentorProfile p, MentorProfile.Status effective,
                                                 List<AvailabilitySlot> slots, List<AvailabilityExceptionDto> exceptions) {
            return from(p, effective, slots, exceptions, null);
        }

        /** US-37 — avatarUrl null = chưa có ảnh; completeness tính từ hồ sơ + lịch rảnh + ảnh. */
        public static MentorProfileResponse from(MentorProfile p, MentorProfile.Status effective,
                                                 List<AvailabilitySlot> slots, List<AvailabilityExceptionDto> exceptions,
                                                 String avatarUrl) {
            CompletenessRules.Completeness completeness = CompletenessRules.mentor(p.getBio(), p.getSkills().length,
                    p.getYearsExperience(), slots.size(), p.getHourlyRate(), p.getPortfolioLinks().length, avatarUrl != null);
            boolean onLeave = effective == MentorProfile.Status.ON_LEAVE;
            return new MentorProfileResponse(p.getUserId(), p.getDisplayName(), Arrays.asList(p.getSkills()),
                    p.getDomain(), p.getBio(), p.getYearsExperience(), p.getCvFileUrl(),
                    Arrays.asList(p.getPortfolioLinks()), p.getHourlyRate(), p.getCapacity(),
                    p.getActiveMenteeCount(), effective == MentorProfile.Status.ACCEPTING, p.getRating(), p.getRatingCount(),
                    p.getVerificationStatus().name(), effective.name(), onLeave ? p.getOnLeaveUntil() : null,
                    effective == p.getStatus() ? p.getStatusReason() : null, p.getMeetingLink(), p.getBufferMinutes(),
                    p.getMinNoticeHours(), Arrays.asList(p.getLanguages()), Arrays.asList(p.getSessionTypes()),
                    p.getTimezone(), slots, exceptions, p.getHeadline(), avatarUrl, completeness,
                    p.getMedianResponseHours());
        }
    }

    public record MenteeProfileInput(
            @NotBlank @Size(max = 100) String displayName,
            @NotBlank @Size(max = 3000) String goal,
            @NotBlank @Size(max = 50) String domain,
            @Pattern(regexp = "BEGINNER|INTERMEDIATE|ADVANCED") String currentLevel,
            @Size(max = 30) List<@NotBlank @Size(max = 50) String> skills,
            @Size(max = 10) List<@Size(max = 300) String> portfolioLinks,
            @Size(max = 500) String cvFileUrl) {
    }

    public record MenteeProfileResponse(
            UUID userId,
            String displayName,
            String goal,
            String domain,
            String currentLevel,
            List<String> skills,
            List<String> portfolioLinks,
            String cvFileUrl,
            List<Integer> preferredDays,
            String preferredTimeOfDay,
            BigDecimal budgetMaxPerHour,
            List<String> languages,
            String timezone,
            String avatarUrl,
            CompletenessRules.Completeness completeness,
            /** US-37 — nút AI Matching bật khi completeness.score ≥ 50. */
            boolean matchingEnabled) {

        public static MenteeProfileResponse from(MenteeProfile p) {
            return from(p, null);
        }

        public static MenteeProfileResponse from(MenteeProfile p, String avatarUrl) {
            String timeOfDay = p.getPreferredTimeOfDay() == null ? null : p.getPreferredTimeOfDay().name();
            CompletenessRules.Completeness completeness = CompletenessRules.mentee(p.getDomain(),
                    p.getCurrentLevel() == null ? null : p.getCurrentLevel().name(), p.getSkills().length, p.getGoal(),
                    p.getCvFileUrl(), p.getPortfolioLinks().length, p.getPreferredDays().length, timeOfDay);
            return new MenteeProfileResponse(p.getUserId(), p.getDisplayName(), p.getGoal(), p.getDomain(),
                    p.getCurrentLevel().name(), Arrays.asList(p.getSkills()), Arrays.asList(p.getPortfolioLinks()),
                    p.getCvFileUrl(), Arrays.asList(p.getPreferredDays()), timeOfDay,
                    p.getBudgetMaxPerHour(), Arrays.asList(p.getLanguages()), p.getTimezone(), avatarUrl, completeness,
                    completeness.score() >= CompletenessRules.MENTEE_MATCHING_MIN);
        }
    }

    /**
     * US-16 — sở thích tìm mentor, thay toàn bộ. preferredDays rỗng = mọi ngày, preferredTimeOfDay null =
     * giờ nào cũng được, budgetMaxPerHour null = không giới hạn, languages rỗng = ngôn ngữ nào cũng được.
     */
    public record MenteePreferencesInput(
            @Size(max = 7) List<Integer> preferredDays,
            String preferredTimeOfDay,
            BigDecimal budgetMaxPerHour,
            @Size(max = 5) List<String> languages) {
    }

    public record AvailabilitySlot(
            UUID id,
            @NotNull @Min(1) @Max(7) Integer dayOfWeek,
            @NotNull LocalTime startTime,
            @NotNull LocalTime endTime) {

        public static AvailabilitySlot from(MentorAvailability a) {
            return new AvailabilitySlot(a.getId(), a.getDayOfWeek(), a.getStartTime(), a.getEndTime());
        }
    }

    /** US-07 — startTime/endTime cùng null = nghỉ cả ngày. */
    public record AvailabilityExceptionInput(
            @NotNull LocalDate date,
            LocalTime startTime,
            LocalTime endTime,
            @Size(max = 300) String reason) {
    }

    /** Giờ trả về dạng "HH:mm" (null khi nghỉ cả ngày), ngày dạng "YYYY-MM-DD". */
    public record AvailabilityExceptionDto(UUID id, LocalDate date, String startTime, String endTime, String reason) {

        public static AvailabilityExceptionDto from(MentorAvailabilityException e) {
            return new AvailabilityExceptionDto(e.getId(), e.getDate(), MentorRules.formatTime(e.getStartTime()),
                    MentorRules.formatTime(e.getEndTime()), e.getReason());
        }
    }

    /** warning != null: lưu thành công nhưng có điều mentor cần tự kiểm tra (vd. phiên đã xác nhận). */
    public record AvailabilityExceptionResult(AvailabilityExceptionDto exception, String warning) {
    }

    public record AvailabilityInput(@NotNull @Size(max = 50) List<@Valid AvailabilitySlot> slots) {
    }

    /** US-45 — kỹ năng cần gỡ khỏi hồ sơ mentee. */
    public record RemoveSkillsInput(@NotNull @Size(max = 30) List<@Size(max = 50) String> skills) {
    }

    public record EnrichmentInput(
            @NotBlank @Size(max = 3000) String enrichedGoalText,
            @Size(max = 30) List<@Size(max = 50) String> cvSkills,
            @Size(max = 500) String cvFileUrl) {
    }

    /** timezone (US-37) — múi giờ IANA của người dùng; mentoring-service dùng cho nhắc lịch (US-34). */
    public record ProfileSummary(UUID userId, String displayName, String role, String domain, String timezone) {
    }

    /** US-37 (PRD-PROF-6) — đổi múi giờ của chính mình (IANA, vd. Asia/Ho_Chi_Minh). */
    public record TimezoneInput(@NotBlank @Size(max = 64) String timezone) {
    }

    public record AvatarResult(String avatarUrl) {
    }

    public record MentorCard(
            UUID userId,
            String displayName,
            String domain,
            List<String> skills,
            int yearsExperience,
            float rating,
            int ratingCount,
            BigDecimal hourlyRate,
            boolean isAvailable,
            boolean hasCapacity,
            String verificationStatus,
            String status,
            LocalDate onLeaveUntil,
            String headline,
            String avatarUrl) {

        public static MentorCard from(MentorProfile p, MentorProfile.Status effective) {
            return from(p, effective, null);
        }

        public static MentorCard from(MentorProfile p, MentorProfile.Status effective, String avatarUrl) {
            return new MentorCard(p.getUserId(), p.getDisplayName(), p.getDomain(), Arrays.asList(p.getSkills()),
                    p.getYearsExperience(), p.getRating(), p.getRatingCount(), p.getHourlyRate(),
                    effective == MentorProfile.Status.ACCEPTING, p.getActiveMenteeCount() < p.getCapacity(),
                    p.getVerificationStatus().name(), effective.name(),
                    effective == MentorProfile.Status.ON_LEAVE ? p.getOnLeaveUntil() : null, p.getHeadline(), avatarUrl);
        }
    }

    /** US-04 — cài đặt đặt lịch, thay toàn bộ (meetingLink rỗng/null = xoá link). */
    public record BookingSettingsInput(
            @Size(max = 500) String meetingLink,
            @NotNull Integer bufferMinutes,
            @NotNull Integer minNoticeHours,
            @NotNull @Size(max = 5) List<String> languages,
            @NotNull @Size(max = 10) List<String> sessionTypes,
            @Size(max = 64) String timezone) {
    }

    /** US-08 — mentor tự đổi trạng thái (không đặt/gỡ được SUSPENDED). */
    public record MentorStatusInput(
            @NotNull @Pattern(regexp = "ACCEPTING|PAUSED|ON_LEAVE", message = "chỉ nhận ACCEPTING, PAUSED, ON_LEAVE") String status,
            LocalDate onLeaveUntil,
            @Size(max = 500) String reason) {
    }

    /** Interface 2 — mentoring-service đặt trạng thái (sau 3 lần vi phạm / tranh chấp). */
    public record InternalStatusUpdate(
            @NotNull @Pattern(regexp = "ACCEPTING|PAUSED|SUSPENDED", message = "chỉ nhận ACCEPTING, PAUSED, SUSPENDED") String status,
            @Size(max = 500) String reason) {
    }

    // ---------------- US-27: admin đình chỉ mentor ----------------

    /** Lý do bắt buộc 10–500 ký tự (kiểm tra sau trim ở MentorRules.validateSuspendReason). */
    public record SuspendInput(@NotNull @Size(max = 600) String reason) {
    }

    /** Một dòng của trang /admin/mentors. status = trạng thái hiệu lực. */
    public record AdminMentorRow(
            UUID userId,
            String displayName,
            String domain,
            String verificationStatus,
            String status,
            LocalDate onLeaveUntil,
            String suspendedReason,
            java.time.OffsetDateTime suspendedAt,
            UUID suspendedBy,
            float rating,
            int ratingCount,
            int activeMenteeCount,
            int capacity) {

        public static AdminMentorRow from(MentorProfile p, MentorProfile.Status effective) {
            return new AdminMentorRow(p.getUserId(), p.getDisplayName(), p.getDomain(), p.getVerificationStatus().name(),
                    effective.name(), effective == MentorProfile.Status.ON_LEAVE ? p.getOnLeaveUntil() : null,
                    p.getSuspendedReason(), p.getSuspendedAt(), p.getSuspendedBy(), p.getRating(), p.getRatingCount(),
                    p.getActiveMenteeCount(), p.getCapacity());
        }
    }

    /**
     * Kết quả đình chỉ / gỡ đình chỉ. mentoringNotified=false khi mentoring-service chưa có endpoint hoặc lỗi
     * (cancelledSessions khi đó là null, warning giải thích cho admin). Gỡ đình chỉ không gọi mentoring-service.
     */
    public record SuspensionResult(AdminMentorRow mentor, boolean mentoringNotified, Integer cancelledSessions,
                                   String warning) {
    }

    public record PageResponse<T>(List<T> items, int page, int size, long totalItems, int totalPages) {
    }

    public record VerificationUpdate(@NotNull @Pattern(regexp = "PENDING_INTERVIEW|PENDING_REVIEW|APPROVED|REJECTED") String status) {
    }

    /** US-35 — medianResponseHours null = mentor chưa có yêu cầu nào được tính. */
    public record ResponseTimeUpdate(@DecimalMin("0") @DecimalMax("100000") BigDecimal medianResponseHours,
                                     @NotNull @Min(0) Integer sampleSize) {
    }

    public record RatingUpdate(@NotNull @DecimalMin("0") @DecimalMax("5") Float rating, @NotNull @Min(0) Integer ratingCount) {
    }

    public record ActiveMenteeUpdate(@NotNull @Min(0) Integer activeMenteeCount) {
    }
}
