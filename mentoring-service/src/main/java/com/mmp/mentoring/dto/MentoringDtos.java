package com.mmp.mentoring.dto;

import com.mmp.mentoring.entity.SessionType;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public final class MentoringDtos {

    private MentoringDtos() {
    }

    // ---------- Mentoring requests ----------

    /**
     * US-14 (PRD-REQ-1) — form yêu cầu: goal bắt buộc 50–1000 ký tự (sau trim), sessionType, frequency,
     * expectedDurationMonths ∈ {1, 3, 6}, message tuỳ chọn.
     */
    public record CreateRequestInput(@NotNull UUID mentorId,
                                     @NotBlank @Size(max = 2000) String goal,
                                     @NotNull SessionType sessionType,
                                     @NotNull com.mmp.mentoring.entity.MentoringRequest.Frequency frequency,
                                     @NotNull Integer expectedDurationMonths,
                                     @Size(max = 1000) String message) {
    }

    /** US-14 (PRD-REQ-2) — REJECT bắt buộc rejectReason; note tuỳ chọn (≤ 500). */
    public record RespondRequestInput(@NotNull @Pattern(regexp = "ACCEPT|REJECT") String decision,
                                      com.mmp.mentoring.entity.MentoringRequest.RejectReason rejectReason,
                                      @Size(max = 500) String note) {
    }

    /** US-14 — tóm tắt hồ sơ mentee cho mentor xét yêu cầu (lấy từ profile-service, best-effort). */
    public record MenteeSummary(String displayName, String domain, String currentLevel, String goal, List<String> skills) {
    }

    public record RequestView(UUID id, UUID menteeId, String menteeName, UUID mentorId, String mentorName, String message,
                              String goal, String sessionType, String frequency, int expectedDurationMonths,
                              String status, String rejectReason, String responseNote, OffsetDateTime createdAt,
                              OffsetDateTime respondedAt, OffsetDateTime expiredAt, MenteeSummary menteeProfile) {
    }

    // ---------- Sessions ----------

    /**
     * US-03 (PRD-SES-2) — form đặt lịch. durationMinutes ∈ {30, 45, 60, 90, 120} (mặc định 60);
     * agenda bắt buộc 20–500 ký tự (sau khi trim); preReadLink tuỳ chọn (http/https).
     * topic giữ lại để tương thích client cũ (hiển thị như tiêu đề ngắn).
     */
    public record BookSessionInput(
            @NotNull UUID menteeId,
            @NotNull UUID mentorId,
            @NotNull @Future OffsetDateTime scheduledAt,
            Integer durationMinutes,
            @NotNull SessionType sessionType,
            @NotBlank @Size(max = 500) String agenda,
            @Size(max = 500) String preReadLink,
            @Size(max = 300) String topic) {
    }

    public record SlotView(OffsetDateTime startAt, OffsetDateTime endAt) {
    }

    public record AvailableSlotsView(String timezone, int durationMinutes, BigDecimal price, List<SlotView> slots) {
    }

    public record CancelSessionInput(@Size(max = 300) String reason) {
    }

    /** US-04 — mentor đổi link phòng họp riêng cho 1 phiên (https Google Meet / Zoom / Teams). */
    public record MeetingLinkInput(@NotBlank @Size(max = 500) String meetingLink) {
    }

    public record SessionView(UUID id, UUID requestId, UUID menteeId, String menteeName, UUID mentorId, String mentorName,
                              OffsetDateTime scheduledAt, OffsetDateTime endsAt, int durationMinutes, BigDecimal price,
                              String topic, String sessionType, String agenda, String preReadLink,
                              String meetingLink, String status, String cancelledBy, String cancelReason, Integer refundPercent,
                              int rescheduleCount, RescheduleView pendingReschedule,
                              String menteeAttendance, String mentorAttendance, OffsetDateTime attendanceDeadline,
                              String attendanceResolution,
                              boolean reviewed, Integer reviewRating, OffsetDateTime createdAt) {
    }

    /** US-12 — câu trả lời xác nhận tham dự. */
    public record AttendanceInput(@NotNull com.mmp.mentoring.entity.MentoringSession.Attendance answer) {
    }

    /** US-06 — đề xuất dời lịch. */
    public record RescheduleInput(@NotNull @Future OffsetDateTime newStart) {
    }

    public record RescheduleView(UUID id, UUID sessionId, UUID proposedBy, OffsetDateTime newStart, OffsetDateTime expiresAt,
                                 String status, OffsetDateTime createdAt) {
    }

    /** US-01 — xem trước khi huỷ: % và số tiền được hoàn, nội dung chính sách áp dụng. */
    public record CancelPreviewView(String cancelledBy, int refundPercent, BigDecimal refundAmount, String policyText,
                                    int rewardPoints, boolean lateFreeCancel) {
    }

    /** Dạng rút gọn cho payment-service gọi nội bộ. */
    public record SessionInternalView(UUID id, UUID menteeId, UUID mentorId, OffsetDateTime scheduledAt,
                                      int durationMinutes, BigDecimal price, String status) {
    }

    public record PaymentSucceededInput(@NotNull UUID transactionId) {
    }

    public record ReviewInput(@NotNull @Min(1) @Max(5) Integer rating, @Size(max = 2000) String comment) {
    }

    public record ReviewView(UUID id, UUID sessionId, UUID menteeId, String menteeName, UUID mentorId, int rating,
                             String comment, OffsetDateTime createdAt) {
    }

    // ---------- Notifications ----------

    public record NotificationView(UUID id, String type, String title, String message, String link, boolean read,
                                   OffsetDateTime createdAt) {
    }

    public record NotificationList(long unreadCount, List<NotificationView> items) {
    }

    public record AdminStats(long pendingSessions, long confirmedSessions, long completedSessions,
                             long cancelledSessions, long awaitingAttendanceSessions, long expiredSessions,
                             long noShowMenteeSessions, long noShowMentorSessions, long disputedSessions) {
    }

    // ---------- Internal ----------

    /** Thông báo do service khác (ai-service) tạo qua /internal/notifications. */
    public record NotificationInput(UUID recipientId, String recipientRole, @NotBlank String type,
                                    @NotBlank @Size(max = 200) String title, @NotBlank @Size(max = 2000) String message,
                                    @Size(max = 500) String link) {
    }

    /** Kết quả /internal/relationships — related = có yêu cầu PENDING hoặc ACCEPTED. */
    public record RelationshipView(UUID mentorId, UUID menteeId, boolean related) {
    }
}
